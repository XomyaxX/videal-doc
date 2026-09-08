import { backfillArchive } from "../src/lib/archive";

async function main() {
  const stats = await backfillArchive({ skipPdf: true });
  console.log("archive backfill", JSON.stringify(stats));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
