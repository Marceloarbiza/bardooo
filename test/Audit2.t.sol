// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {BetFactory, Bet} from "../contracts/P2PBetting.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";

contract BlacklistUSDC is ERC20 {
    mapping(address => bool) public blocked;
    constructor() ERC20("Blacklist USDC", "bUSDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 a) external { _mint(to, a); }
    function setBlocked(address a, bool v) external { blocked[a] = v; }
    function _update(address from, address to, uint256 v) internal override {
        require(!blocked[from] && !blocked[to], "blacklisted");
        super._update(from, to, v);
    }
}

contract Audit2 is Test {
    MockUSDC usdc;
    BetFactory factory;
    address treasury = makeAddr("treasury");
    address creator  = makeAddr("creator");
    address alice    = makeAddr("alice");
    address bob      = makeAddr("bob");
    address carol    = makeAddr("carol");
    address dan      = makeAddr("dan");
    uint64 closeT; uint64 resolveT;

    function setUp() public {
        usdc = new MockUSDC();
        factory = new BetFactory(address(0), address(usdc), treasury, 300,700,100,900, 4 hours);
        closeT   = uint64(block.timestamp + 1 hours);
        resolveT = uint64(block.timestamp + 3 hours);
    }
    function _cfg() internal view returns (Bet.Config memory) {
        return Bet.Config({description:"q", numOptions:2, stakeMode:Bet.StakeMode.Free,
            fixedAmount:0, maxStake:0, minStake:1e6, maxBettors:0,
            closeTime:closeT, resolveTime:resolveT, isFlash:false});
    }
    function _bet(Bet b, address who, uint8 opt, uint256 amt) internal {
        usdc.mint(who, amt); vm.startPrank(who); usdc.approve(address(b), amt); b.placeBet(opt, amt); vm.stopPrank();
    }

    // ATAQUE A: el split en dos llamadas independientes suma EXACTAMENTE totalCommission?
    // Fuzz de montos: platformCut + creatorCut == totalCommission, sin cobrar de mas.
    function testFuzz_SplitSumsToCommission(uint96 a0, uint96 a1) public {
        a0 = uint96(bound(a0, 1e6, 1_000_000e6));
        a1 = uint96(bound(a1, 1e6, 1_000_000e6));
        vm.prank(creator); Bet b = Bet(factory.createBet(_cfg()));
        _bet(b, alice, 0, a0);
        _bet(b, bob,   1, a1);
        vm.warp(resolveT);
        // creador resuelve al lado 1
        vm.prank(creator); b.resolve(1);

        uint256 comm = b.totalCommission();
        uint256 tPre = usdc.balanceOf(treasury);
        uint256 cPre = usdc.balanceOf(creator);
        b.withdrawPlatformFee();
        b.withdrawCreatorFee();
        uint256 paid = (usdc.balanceOf(treasury)-tPre) + (usdc.balanceOf(creator)-cPre);
        assertEq(paid, comm, "split debe sumar EXACTO la comision");
    }

    // ATAQUE B: solvencia total tras fees separados + TODOS los claims.
    // El contrato nunca debe revertir por fondos insuficientes; dust >= 0.
    function testFuzz_SolventAfterSeparateWithdrawAndClaims(uint96 a0, uint96 a1, uint96 a2) public {
        a0 = uint96(bound(a0, 1e6, 500_000e6));
        a1 = uint96(bound(a1, 1e6, 500_000e6));
        a2 = uint96(bound(a2, 1e6, 500_000e6));
        vm.prank(creator); Bet b = Bet(factory.createBet(_cfg()));
        _bet(b, alice, 1, a0); // ganadores lado 1
        _bet(b, carol, 1, a2);
        _bet(b, bob,   0, a1); // perdedor lado 0
        vm.warp(resolveT);
        vm.prank(creator); b.resolve(1);

        uint256 total = uint256(a0)+a1+a2;
        // retiro fees en orden creador-primero para variar
        b.withdrawCreatorFee();
        b.withdrawPlatformFee();
        vm.prank(alice); b.claim();
        vm.prank(carol); b.claim();
        // no revirtio => solvente. El balance residual es dust >= 0.
        uint256 out = usdc.balanceOf(alice)+usdc.balanceOf(carol)+usdc.balanceOf(treasury)+usdc.balanceOf(creator);
        assertLe(out, total, "nunca se paga mas que el pozo");
        assertEq(usdc.balanceOf(address(b)), total - out, "residual = dust en el contrato");
        // invariante nunca-menos-que-tu-stake
        assertGe(usdc.balanceOf(alice), a0, "alice cobra >= stake");
        assertGe(usdc.balanceOf(carol), a2, "carol cobra >= stake");
    }

    // ATAQUE C: withdrawFees() atajo con treasury bloqueado (revierte platform PRIMERO).
    // El atajo revierte entero, pero el creador puede cobrar por la funcion directa.
    function test_Shortcut_TreasuryBlocked_CreatorStillPaidDirect() public {
        BlacklistUSDC bl = new BlacklistUSDC();
        BetFactory f = new BetFactory(address(0), address(bl), treasury, 300,700,100,900, 4 hours);
        vm.prank(creator); Bet b = Bet(f.createBet(_cfg()));
        bl.mint(alice,60e6); vm.startPrank(alice); bl.approve(address(b),60e6); b.placeBet(0,60e6); vm.stopPrank();
        bl.mint(bob,70e6);   vm.startPrank(bob);   bl.approve(address(b),70e6); b.placeBet(1,70e6); vm.stopPrank();
        vm.warp(resolveT);
        vm.prank(creator); b.resolve(1);

        bl.setBlocked(treasury, true); // Circle bloquea la treasury

        // el atajo revierte porque intenta la plataforma primero
        vm.expectRevert("blacklisted");
        b.withdrawFees();
        // el creador NO queda rehen: cobra por la funcion directa
        b.withdrawCreatorFee();
        assertEq(bl.balanceOf(creator), 9_100_000, "creador cobra pese a treasury bloqueada");
        assertFalse(b.platformFeePaid());
        assertTrue(b.creatorFeePaid());
    }

    // ATAQUE D: doble via mixta: withdrawPlatformFee directo, luego withdrawFees atajo.
    // No debe pagar dos veces la plataforma; debe completar solo el creador.
    function test_Mixed_NoDoublePlatform() public {
        vm.prank(creator); Bet b = Bet(factory.createBet(_cfg()));
        _bet(b, alice, 0, 60e6);
        _bet(b, bob,   1, 70e6);
        vm.warp(resolveT);
        vm.prank(creator); b.resolve(1);
        b.withdrawPlatformFee();
        assertEq(usdc.balanceOf(treasury), 3_900_000);
        b.withdrawFees(); // debe saltar plataforma (ya pagada) y pagar creador
        assertEq(usdc.balanceOf(treasury), 3_900_000, "sin doble cobro plataforma");
        assertEq(usdc.balanceOf(creator),  9_100_000, "creador cobrado una vez");
        // reintento total: nada cambia
        b.withdrawFees();
        assertEq(usdc.balanceOf(treasury), 3_900_000);
        assertEq(usdc.balanceOf(creator),  9_100_000);
    }
}
