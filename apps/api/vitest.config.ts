import { defineConfig } from "vitest/config";

/*  Los tests SIEMPRE corren contra bardooo_test. Se setea acá (y no adentro
    del test) porque los imports de ESM se ejecutan antes que cualquier línea
    del archivo de test: para cuando el test asigna process.env, PrismaClient
    ya capturó la URL del .env. Vitest evalúa esta config antes de importar
    los módulos de test.                                                      */
const TEST_DB =
  process.env.BARDOOO_TEST_DATABASE_URL ??
  "postgresql://marceloarbiza@localhost:5432/bardooo_test";

export default defineConfig({
  test: {
    env: {
      BARDOOO_DATABASE_URL: TEST_DB,
    },
    // los archivos de test comparten la DB de test: en serie, no en paralelo
    fileParallelism: false,
  },
});
