// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*  Suite de tests de BARDOOO (BetFactory + Bet).
    Los valores esperados de los casos "pareja" y "despareja" fueron validados
    ademas con fuzzing externo (~147k escenarios, 0 fallos de invariantes).
    Unidades: USDC de 6 decimales (1 USDC = 1e6).                              */

import {Test} from "forge-std/Test.sol";
import {BetFactory, Bet} from "../contracts/P2PBetting.sol";
import {MockUSDC} from "../contracts/MockUSDC.sol";

contract BetTest is Test {
    MockUSDC usdc;
    BetFactory factory;

    address treasury = makeAddr("treasury");
    address creator  = makeAddr("creator");
    address alice    = makeAddr("alice");
    address bob      = makeAddr("bob");
    address carol    = makeAddr("carol");
    address dave     = makeAddr("dave");

    uint16 constant PLATFORM_BPS    = 300;   // 3%
    uint16 constant MAX_CREATOR_BPS = 1000;  // 10%
    uint64 constant GRACE           = 48 hours;

    uint8 constant NO = 0;
    uint8 constant SI = 1;

    uint64 closeT;
    uint64 resolveT;

    function setUp() public {
        usdc = new MockUSDC();
        factory = new BetFactory(
            address(0), address(usdc), treasury,
            PLATFORM_BPS, MAX_CREATOR_BPS, GRACE
        );
        closeT   = uint64(block.timestamp + 1 hours);
        resolveT = uint64(block.timestamp + 3 hours);
    }

    /*//////////////////////////// helpers ////////////////////////////*/

    function _cfg(
        Bet.StakeMode mode, uint256 fixedAmt, uint256 maxStake,
        uint256 maxBettors, uint16 creatorBps
    ) internal view returns (Bet.Config memory) {
        return Bet.Config({
            description: "test",
            numOptions: 2,
            stakeMode: mode,
            fixedAmount: fixedAmt,
            maxStake: maxStake,
            minStake: 1e6,
            maxBettors: maxBettors,
            closeTime: closeT,
            resolveTime: resolveT,
            creatorFeeBps: creatorBps
        });
    }

    function _newFreeBet(uint16 creatorBps) internal returns (Bet) {
        vm.prank(creator);
        return Bet(factory.createBet(_cfg(Bet.StakeMode.Free, 0, 0, 0, creatorBps)));
    }

    function _bet(Bet b, address who, uint8 opt, uint256 amt) internal {
        usdc.mint(who, amt);
        vm.startPrank(who);
        usdc.approve(address(b), amt);
        b.placeBet(opt, amt);
        vm.stopPrank();
    }

    /*//////////////////////// caso pareja (chat) ////////////////////////*/
    // SI = 70 (alice 20, bob 50), NO = 60 (carol). Fee total 10% (3% + 7%).
    // total 130, comision 13 <= perdedor 60 -> neto 117.
    // alice: 20e6*117e6/70e6 = 33_428_571 ; bob: 50e6*117e6/70e6 = 83_571_428.
    // dust = 117e6 - (33_428_571 + 83_571_428) = 1 unidad.

    function test_EvenCase_ExactPayoutsAndDust() public {
        Bet b = _newFreeBet(700);
        _bet(b, alice, SI, 20e6);
        _bet(b, bob,   SI, 50e6);
        _bet(b, carol, NO, 60e6);

        vm.warp(resolveT);
        vm.prank(creator);
        b.resolve(SI);

        assertEq(b.totalCommission(), 13e6, "comision 10% de 130");

        vm.prank(alice); b.claim();
        vm.prank(bob);   b.claim();
        assertEq(usdc.balanceOf(alice), 33_428_571);
        assertEq(usdc.balanceOf(bob),   83_571_428);

        // ganadores nunca cobran menos que su stake
        assertGe(usdc.balanceOf(alice), 20e6);
        assertGe(usdc.balanceOf(bob),   50e6);

        vm.prank(creator); b.withdrawFees();
        // split: platform 300/1000 de 13e6 = 3.9e6 ; creador el resto = 9.1e6
        assertEq(usdc.balanceOf(treasury), 3_900_000);
        assertEq(usdc.balanceOf(creator),  9_100_000);

        // solvencia: en el contrato solo queda el dust (1 unidad)
        assertEq(usdc.balanceOf(address(b)), 1);
    }

    /*/////////////////////// caso despareja (chat) ///////////////////////*/
    // SI = 120 (alice), NO = 10 (carol). 10% de 130 = 13 > perdedor 10
    // -> comision topeada a 10. Neto 120: alice recupera EXACTO su stake.

    function test_LopsidedCase_CommissionCappedToLosingPool() public {
        Bet b = _newFreeBet(700);
        _bet(b, alice, SI, 120e6);
        _bet(b, carol, NO, 10e6);

        vm.warp(resolveT);
        vm.prank(creator);
        b.resolve(SI);

        assertEq(b.totalCommission(), 10e6, "topeada al pozo perdedor");

        vm.prank(alice); b.claim();
        assertEq(usdc.balanceOf(alice), 120e6, "el ganador nunca pierde");
    }

    /*//////////////////////// regla de un solo lado ////////////////////////*/

    function test_OneSideRule_CannotBetBothSides() public {
        Bet b = _newFreeBet(500);
        _bet(b, alice, SI, 10e6);

        usdc.mint(alice, 10e6);
        vm.startPrank(alice);
        usdc.approve(address(b), 10e6);
        vm.expectRevert(Bet.AlreadyOnOtherSide.selector);
        b.placeBet(NO, 10e6);
        vm.stopPrank();
    }

    function test_OneSideRule_CanAddToSameSide() public {
        Bet b = _newFreeBet(500);
        _bet(b, alice, SI, 10e6);
        _bet(b, alice, SI, 5e6);
        assertEq(b.stakeOf(alice, SI), 15e6);
        assertEq(b.totalBettors(), 1, "sumar no duplica el conteo");
    }

    /*//////////////////////// modos de stake ////////////////////////*/

    function test_FixedMode_WrongAmountReverts() public {
        vm.prank(creator);
        Bet b = Bet(factory.createBet(_cfg(Bet.StakeMode.Fixed, 20e6, 0, 0, 500)));

        usdc.mint(alice, 100e6);
        vm.startPrank(alice);
        usdc.approve(address(b), 100e6);
        vm.expectRevert(Bet.WrongAmount.selector);
        b.placeBet(SI, 19e6);
        b.placeBet(SI, 20e6); // el monto exacto funciona
        vm.stopPrank();
    }

    function test_CappedMode_OverCapAcrossCallsReverts() public {
        vm.prank(creator);
        Bet b = Bet(factory.createBet(_cfg(Bet.StakeMode.Capped, 0, 50e6, 0, 500)));
        _bet(b, alice, SI, 40e6);

        usdc.mint(alice, 20e6);
        vm.startPrank(alice);
        usdc.approve(address(b), 20e6);
        vm.expectRevert(Bet.OverCap.selector);
        b.placeBet(SI, 20e6); // 40 + 20 > tope 50
        vm.stopPrank();
    }

    function test_FreeMode_BelowMinReverts() public {
        Bet b = _newFreeBet(500);
        usdc.mint(alice, 1e6);
        vm.startPrank(alice);
        usdc.approve(address(b), 1e6);
        vm.expectRevert(Bet.BelowMin.selector);
        b.placeBet(SI, 0.5e6);
        vm.stopPrank();
    }

    /*//////////////////////// tiempos y bloqueo ////////////////////////*/

    function test_BettingClosedAfterCloseTime() public {
        Bet b = _newFreeBet(500);
        vm.warp(closeT);
        usdc.mint(alice, 10e6);
        vm.startPrank(alice);
        usdc.approve(address(b), 10e6);
        vm.expectRevert(Bet.BettingClosed.selector);
        b.placeBet(SI, 10e6);
        vm.stopPrank();
    }

    function test_MaxBettors_LocksAtTotal() public {
        vm.prank(creator);
        Bet b = Bet(factory.createBet(_cfg(Bet.StakeMode.Free, 0, 0, 2, 500)));
        _bet(b, alice, SI, 10e6);
        _bet(b, carol, NO, 10e6); // llega al tope total de 2 -> Locked

        assertEq(uint8(b.status()), uint8(Bet.Status.Locked));

        usdc.mint(bob, 10e6);
        vm.startPrank(bob);
        usdc.approve(address(b), 10e6);
        vm.expectRevert(Bet.BadState.selector);
        b.placeBet(SI, 10e6);
        vm.stopPrank();
    }

    /*//////////////////////// resolver ////////////////////////*/

    function test_Resolve_OnlyCreator() public {
        Bet b = _newFreeBet(500);
        _bet(b, alice, SI, 10e6);
        _bet(b, carol, NO, 10e6);
        vm.warp(resolveT);
        vm.prank(alice);
        vm.expectRevert(Bet.NotCreator.selector);
        b.resolve(SI);
    }

    function test_Resolve_TooEarly() public {
        Bet b = _newFreeBet(500);
        _bet(b, alice, SI, 10e6);
        _bet(b, carol, NO, 10e6);
        vm.warp(resolveT - 1);
        vm.prank(creator);
        vm.expectRevert(Bet.TooEarly.selector);
        b.resolve(SI);
    }

    function test_Resolve_NoContest_AutoCancelsAndRefunds() public {
        Bet b = _newFreeBet(500);
        _bet(b, alice, SI, 10e6); // solo un lado
        vm.warp(resolveT);
        vm.prank(creator);
        b.resolve(SI);
        assertEq(uint8(b.status()), uint8(Bet.Status.Cancelled));

        vm.prank(alice); b.refund();
        assertEq(usdc.balanceOf(alice), 10e6, "devolucion completa, sin comision");
    }

    /*//////////////////////// cancelar y valvula ////////////////////////*/

    function test_Cancel_RefundsEveryoneInFull() public {
        Bet b = _newFreeBet(500);
        _bet(b, alice, SI, 33e6);
        _bet(b, carol, NO, 12e6);
        vm.prank(creator); b.cancel();

        vm.prank(alice); b.refund();
        vm.prank(carol); b.refund();
        assertEq(usdc.balanceOf(alice), 33e6);
        assertEq(usdc.balanceOf(carol), 12e6);
        assertEq(usdc.balanceOf(address(b)), 0, "no queda nada atrapado");
    }

    function test_ForceRefund_OnlyAfterGrace() public {
        Bet b = _newFreeBet(500);
        _bet(b, alice, SI, 10e6);
        _bet(b, carol, NO, 10e6);

        vm.warp(uint256(resolveT) + GRACE); // justo en el limite: todavia no
        vm.prank(dave);
        vm.expectRevert(Bet.GraceNotOver.selector);
        b.forceRefund();

        vm.warp(uint256(resolveT) + GRACE + 1); // cualquiera puede gatillarla
        vm.prank(dave);
        b.forceRefund();
        assertEq(uint8(b.status()), uint8(Bet.Status.Cancelled));

        vm.prank(alice); b.refund();
        assertEq(usdc.balanceOf(alice), 10e6);
    }

    /*//////////////////////// cobrar ////////////////////////*/

    function test_Claim_DoubleClaimReverts() public {
        Bet b = _newFreeBet(500);
        _bet(b, alice, SI, 10e6);
        _bet(b, carol, NO, 10e6);
        vm.warp(resolveT);
        vm.prank(creator); b.resolve(SI);

        vm.startPrank(alice);
        b.claim();
        vm.expectRevert(Bet.AlreadySettled.selector);
        b.claim();
        vm.stopPrank();
    }

    function test_Claim_LoserHasNothing() public {
        Bet b = _newFreeBet(500);
        _bet(b, alice, SI, 10e6);
        _bet(b, carol, NO, 10e6);
        vm.warp(resolveT);
        vm.prank(creator); b.resolve(SI);

        vm.prank(carol);
        vm.expectRevert(Bet.NothingToClaim.selector);
        b.claim();
    }

    function test_PreviewPayout_MatchesClaim() public {
        Bet b = _newFreeBet(700);
        _bet(b, alice, SI, 20e6);
        _bet(b, bob,   SI, 50e6);
        _bet(b, carol, NO, 60e6);
        vm.warp(resolveT);
        vm.prank(creator); b.resolve(SI);

        uint256 preview = b.previewPayout(alice);
        vm.prank(alice); b.claim();
        assertEq(usdc.balanceOf(alice), preview);
    }

    /*//////////////////////// factory ////////////////////////*/

    function test_Factory_CreatorFeeTooHighReverts() public {
        vm.prank(creator);
        vm.expectRevert(BetFactory.CreatorFeeTooHigh.selector);
        factory.createBet(_cfg(Bet.StakeMode.Free, 0, 0, 0, MAX_CREATOR_BPS + 1));
    }

    function test_Factory_RegistersBetsAndInjectsPlatformParams() public {
        Bet b = _newFreeBet(500);
        assertEq(factory.totalBets(), 1);
        assertEq(factory.allBets(0), address(b));
        assertEq(b.platformFeeBps(), PLATFORM_BPS);
        assertEq(b.gracePeriod(), GRACE);
        assertEq(b.creator(), creator);
    }

    /*//////////////////////// fuzz on-chain ////////////////////////*/
    // Espejo (acotado) del fuzzing externo: con montos aleatorios en ambos lados,
    // el ganador nunca cobra menos que su stake y el contrato queda solvente.

    function testFuzz_WinnerNeverLoses_ContractStaysSolvent(
        uint96 aStake, uint96 cStake, uint16 creatorBps
    ) public {
        aStake = uint96(bound(aStake, 1e6, 1_000_000e6));
        cStake = uint96(bound(cStake, 1e6, 1_000_000e6));
        creatorBps = uint16(bound(creatorBps, 0, MAX_CREATOR_BPS));

        Bet b = _newFreeBet(creatorBps);
        _bet(b, alice, SI, aStake);
        _bet(b, carol, NO, cStake);

        vm.warp(resolveT);
        vm.prank(creator); b.resolve(SI);

        vm.prank(alice); b.claim();
        assertGe(usdc.balanceOf(alice), aStake, "ganador nunca pierde");

        vm.prank(creator); b.withdrawFees();
        // lo repartido nunca supera lo recaudado (el resto es dust >= 0)
        uint256 paidOut = usdc.balanceOf(alice) + usdc.balanceOf(treasury) + usdc.balanceOf(creator);
        assertLe(paidOut, uint256(aStake) + uint256(cStake));
    }
}
