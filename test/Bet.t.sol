// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*  Suite de tests de BARDOOO (BetFactory + Bet) — modelo de comisiones FIJAS
    (decision del dueño 2026-07-05): normal 3% plataforma + 7% creador;
    relampago 1% + 9%. El TOTAL que sale del pozo es 10% SIEMPRE (invariante
    con require en la factory). Los valores del caso "pareja" y "despareja"
    estan validados ademas con fuzzing externo (~147k escenarios).
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

    uint16 constant PLATFORM_BPS       = 300; // 3%
    uint16 constant CREATOR_BPS        = 700; // 7%
    uint16 constant FLASH_PLATFORM_BPS = 100; // 1%
    uint16 constant FLASH_CREATOR_BPS  = 900; // 9%
    uint64 constant GRACE              = 4 hours; // decision del dueño: global corto

    uint8 constant NO = 0;
    uint8 constant SI = 1;

    uint64 closeT;
    uint64 resolveT;

    function setUp() public {
        usdc = new MockUSDC();
        factory = new BetFactory(
            address(0), address(usdc), treasury,
            PLATFORM_BPS, CREATOR_BPS, FLASH_PLATFORM_BPS, FLASH_CREATOR_BPS, GRACE
        );
        closeT   = uint64(block.timestamp + 1 hours);
        resolveT = uint64(block.timestamp + 3 hours);
    }

    /*//////////////////////////// helpers ////////////////////////////*/

    function _cfg(
        Bet.StakeMode mode, uint256 fixedAmt, uint256 maxStake,
        uint256 maxBettors, bool isFlash
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
            isFlash: isFlash
        });
    }

    function _newFreeBet(bool isFlash) internal returns (Bet) {
        vm.prank(creator);
        return Bet(factory.createBet(_cfg(Bet.StakeMode.Free, 0, 0, 0, isFlash)));
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
        Bet b = _newFreeBet(false);
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
        // split fijo: plataforma 300/1000 de 13e6 = 3.9e6 ; creador 700/1000 = 9.1e6
        assertEq(usdc.balanceOf(treasury), 3_900_000);
        assertEq(usdc.balanceOf(creator),  9_100_000);

        // solvencia: en el contrato solo queda el dust (1 unidad)
        assertEq(usdc.balanceOf(address(b)), 1);
    }

    /*//////////////////// relampago: mismo total, otro split ////////////////////*/
    // REGLA INVIOLABLE: el apostador paga EXACTAMENTE lo mismo; solo cambia
    // como se reparte la comision (plataforma cede al creador).

    function test_Flash_SameTotalDifferentSplit() public {
        Bet b = _newFreeBet(true);
        _bet(b, alice, SI, 20e6);
        _bet(b, bob,   SI, 50e6);
        _bet(b, carol, NO, 60e6);

        vm.warp(resolveT);
        vm.prank(creator);
        b.resolve(SI);

        // comision total identica al caso normal
        assertEq(b.totalCommission(), 13e6, "el total NO cambia en flash");

        vm.prank(alice); b.claim();
        vm.prank(bob);   b.claim();
        // payouts identicos al caso normal
        assertEq(usdc.balanceOf(alice), 33_428_571);
        assertEq(usdc.balanceOf(bob),   83_571_428);

        vm.prank(creator); b.withdrawFees();
        // split flash: plataforma 100/1000 de 13e6 = 1.3e6 ; creador 11.7e6
        assertEq(usdc.balanceOf(treasury), 1_300_000);
        assertEq(usdc.balanceOf(creator),  11_700_000);
    }

    /*/////////////////////// caso despareja (chat) ///////////////////////*/
    // SI = 120 (alice), NO = 10 (carol). 10% de 130 = 13 > perdedor 10
    // -> comision topeada a 10. Neto 120: alice recupera EXACTO su stake.

    function test_LopsidedCase_CommissionCappedToLosingPool() public {
        Bet b = _newFreeBet(false);
        _bet(b, alice, SI, 120e6);
        _bet(b, carol, NO, 10e6);

        vm.warp(resolveT);
        vm.prank(creator);
        b.resolve(SI);

        assertEq(b.totalCommission(), 10e6, "topeada al pozo perdedor");

        vm.prank(alice); b.claim();
        assertEq(usdc.balanceOf(alice), 120e6, "el ganador nunca pierde");
    }

    /*//////////////////// el creador no apuesta en su pozo ////////////////////*/

    function test_CreatorCannotBetOwnPot() public {
        Bet b = _newFreeBet(false);
        usdc.mint(creator, 10e6);
        vm.startPrank(creator);
        usdc.approve(address(b), 10e6);
        vm.expectRevert(Bet.CreatorCannotBet.selector);
        b.placeBet(SI, 10e6);
        vm.stopPrank();
    }

    /*//////////////////////// lockBetting ////////////////////////*/

    function test_LockBetting_CreatorClosesEarly() public {
        Bet b = _newFreeBet(false);
        _bet(b, alice, SI, 10e6);
        _bet(b, carol, NO, 10e6);

        vm.prank(creator);
        b.lockBetting();
        assertEq(uint8(b.status()), uint8(Bet.Status.Locked));

        // nadie mas entra, aunque falte para closeTime
        usdc.mint(bob, 10e6);
        vm.startPrank(bob);
        usdc.approve(address(b), 10e6);
        vm.expectRevert(Bet.BadState.selector);
        b.placeBet(SI, 10e6);
        vm.stopPrank();

        // pero NO adelanta la resolucion: resolveTime sigue mandando
        vm.prank(creator);
        vm.expectRevert(Bet.TooEarly.selector);
        b.resolve(SI);

        vm.warp(resolveT);
        vm.prank(creator);
        b.resolve(SI); // desde Locked se resuelve normal
        assertEq(uint8(b.status()), uint8(Bet.Status.Resolved));
    }

    function test_LockBetting_OnlyCreator() public {
        Bet b = _newFreeBet(false);
        vm.prank(alice);
        vm.expectRevert(Bet.NotCreator.selector);
        b.lockBetting();
    }

    /*//////////////////////// regla de un solo lado ////////////////////////*/

    function test_OneSideRule_CannotBetBothSides() public {
        Bet b = _newFreeBet(false);
        _bet(b, alice, SI, 10e6);

        usdc.mint(alice, 10e6);
        vm.startPrank(alice);
        usdc.approve(address(b), 10e6);
        vm.expectRevert(Bet.AlreadyOnOtherSide.selector);
        b.placeBet(NO, 10e6);
        vm.stopPrank();
    }

    function test_OneSideRule_CanAddToSameSide() public {
        Bet b = _newFreeBet(false);
        _bet(b, alice, SI, 10e6);
        _bet(b, alice, SI, 5e6);
        assertEq(b.stakeOf(alice, SI), 15e6);
        assertEq(b.totalBettors(), 1, "sumar no duplica el conteo");
    }

    /*//////////////////////// modos de stake ////////////////////////*/

    function test_FixedMode_WrongAmountReverts() public {
        vm.prank(creator);
        Bet b = Bet(factory.createBet(_cfg(Bet.StakeMode.Fixed, 20e6, 0, 0, false)));

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
        Bet b = Bet(factory.createBet(_cfg(Bet.StakeMode.Capped, 0, 50e6, 0, false)));
        _bet(b, alice, SI, 40e6);

        usdc.mint(alice, 20e6);
        vm.startPrank(alice);
        usdc.approve(address(b), 20e6);
        vm.expectRevert(Bet.OverCap.selector);
        b.placeBet(SI, 20e6); // 40 + 20 > tope 50
        vm.stopPrank();
    }

    function test_FreeMode_BelowMinReverts() public {
        Bet b = _newFreeBet(false);
        usdc.mint(alice, 1e6);
        vm.startPrank(alice);
        usdc.approve(address(b), 1e6);
        vm.expectRevert(Bet.BelowMin.selector);
        b.placeBet(SI, 0.5e6);
        vm.stopPrank();
    }

    /*//////////////////////// tiempos y bloqueo ////////////////////////*/

    function test_BettingClosedAfterCloseTime() public {
        Bet b = _newFreeBet(false);
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
        Bet b = Bet(factory.createBet(_cfg(Bet.StakeMode.Free, 0, 0, 2, false)));
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
        Bet b = _newFreeBet(false);
        _bet(b, alice, SI, 10e6);
        _bet(b, carol, NO, 10e6);
        vm.warp(resolveT);
        vm.prank(alice);
        vm.expectRevert(Bet.NotCreator.selector);
        b.resolve(SI);
    }

    function test_Resolve_TooEarly() public {
        Bet b = _newFreeBet(false);
        _bet(b, alice, SI, 10e6);
        _bet(b, carol, NO, 10e6);
        vm.warp(resolveT - 1);
        vm.prank(creator);
        vm.expectRevert(Bet.TooEarly.selector);
        b.resolve(SI);
    }

    function test_Resolve_NoContest_AutoCancelsAndRefunds() public {
        Bet b = _newFreeBet(false);
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
        Bet b = _newFreeBet(false);
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
        Bet b = _newFreeBet(false);
        _bet(b, alice, SI, 10e6);
        _bet(b, carol, NO, 10e6);

        vm.warp(uint256(resolveT) + GRACE); // justo en el limite (4h): todavia no
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
        Bet b = _newFreeBet(false);
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
        Bet b = _newFreeBet(false);
        _bet(b, alice, SI, 10e6);
        _bet(b, carol, NO, 10e6);
        vm.warp(resolveT);
        vm.prank(creator); b.resolve(SI);

        vm.prank(carol);
        vm.expectRevert(Bet.NothingToClaim.selector);
        b.claim();
    }

    function test_PreviewPayout_MatchesClaim() public {
        Bet b = _newFreeBet(false);
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

    function test_Factory_RegistersBetsAndInjectsSplit() public {
        Bet b = _newFreeBet(false);
        assertEq(factory.totalBets(), 1);
        assertEq(factory.allBets(0), address(b));
        assertEq(b.platformFeeBps(), PLATFORM_BPS);
        assertEq(b.creatorFeeBps(), CREATOR_BPS);
        assertEq(b.gracePeriod(), GRACE);
        assertEq(b.creator(), creator);

        Bet f = _newFreeBet(true);
        assertEq(f.platformFeeBps(), FLASH_PLATFORM_BPS);
        assertEq(f.creatorFeeBps(), FLASH_CREATOR_BPS);
    }

    function test_Factory_FeeTotalsMustMatch() public {
        // constructor: total normal (10%) != total flash (9%) -> revierte
        vm.expectRevert(BetFactory.FeeTotalsMismatch.selector);
        new BetFactory(address(0), address(usdc), treasury, 300, 700, 100, 800, GRACE);

        // setter con la misma regla
        vm.expectRevert(BetFactory.FeeTotalsMismatch.selector);
        factory.setFees(300, 700, 200, 900);

        // y techo duro del 20% total
        vm.expectRevert(BetFactory.FeeTooHigh.selector);
        factory.setFees(1500, 600, 1200, 900);

        // un cambio valido pasa (mismo total en ambos modos)
        factory.setFees(200, 800, 100, 900);
        assertEq(factory.platformFeeBps(), 200);
        assertEq(factory.flashCreatorFeeBps(), 900);
    }

    /*//////////////////////// fuzz on-chain ////////////////////////*/
    // Espejo (acotado) del fuzzing externo: con montos aleatorios en ambos lados
    // y en ambos modos (normal/flash), el ganador nunca cobra menos que su stake
    // y el contrato queda solvente.

    function testFuzz_WinnerNeverLoses_ContractStaysSolvent(
        uint96 aStake, uint96 cStake, bool isFlash
    ) public {
        aStake = uint96(bound(aStake, 1e6, 1_000_000e6));
        cStake = uint96(bound(cStake, 1e6, 1_000_000e6));

        Bet b = _newFreeBet(isFlash);
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

        // y la comision total es la MISMA sea flash o no (solo cambia el split)
        assertEq(uint256(b.platformFeeBps()) + b.creatorFeeBps(), 1000);
    }
}
