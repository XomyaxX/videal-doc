import { backfillLibraryFiles } from "../src/lib/library";

async function main() {
  const n = await backfillLibraryFiles();
  console.log("library files backfill", n);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
