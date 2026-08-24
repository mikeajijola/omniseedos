import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const schemaLoader = 'const schema = JSON.parse(readFileSync(new URL("../schema/omniform.schema.json", import.meta.url), "utf8"));';

export async function embedOmniformSchema({ serverRoot, schemaPath }) {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const matches = [];

  for (const path of await moduleFiles(serverRoot)) {
    const source = await readFile(path, "utf8");
    const occurrences = source.split(schemaLoader).length - 1;
    if (occurrences > 0) matches.push({ path, source, occurrences });
  }

  const occurrences = matches.reduce((total, match) => total + match.occurrences, 0);
  if (occurrences < 1) {
    throw new Error("Expected at least one bundled Omniform schema loader");
  }

  const embedded = `const schema = ${JSON.stringify(schema)};`;
  for (const match of matches) await writeFile(match.path, match.source.replaceAll(schemaLoader, embedded));
  return { bundle: matches[0].path, bundles: matches.map(match => match.path), occurrences, schemaId: schema.$id };
}

async function moduleFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await moduleFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".mjs")) files.push(path);
  }
  return files;
}
