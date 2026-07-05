/* ---- espejo exacto del contrato ----
   La matemática vive en @bardooo/core (enteros de 6 decimales, testeada contra
   los números de contracts/test/Bet.t.sol). Acá solo se re-exporta con los
   nombres que usa la UI. NO escribir fórmulas de reparto en el frontend.      */

export {
  displayCommission as commission,
  displayPayoutFor as payoutFor,
  displayMultFor as multFor,
  displayFeeSplit as feeSplit,
} from "@bardooo/core";
