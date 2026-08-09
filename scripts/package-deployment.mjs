import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const args = parse(process.argv.slice(2));
for (const name of ["omniform", "engine", "runtime", "out"]) if (!args[name]) throw new Error(`--${name} is required`);
const root = resolve(new URL("..", import.meta.url).pathname), out = resolve(args.out);
await mkdir(out, { recursive: false }); await mkdir(resolve(out, "vendor")); await mkdir(resolve(out, "runtime"));
for (const directory of ["public", "src", "api", "scripts"]) await cp(resolve(root, directory), resolve(out, directory), { recursive: true });
await cp(resolve(root, "vercel.json"), resolve(out, "vercel.json"));
await cp(resolve(args.runtime), resolve(out, "runtime/company-runtime.json"));
await cp(resolve(args.omniform), resolve(out, `vendor/${basename(args.omniform)}`));
await cp(resolve(args.engine), resolve(out, `vendor/${basename(args.engine)}`));
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
manifest.dependencies = { "@omniseed/omniform": `file:vendor/${basename(args.omniform)}`, "@omniseed/engine": `file:vendor/${basename(args.engine)}` };
delete manifest.devDependencies;
await writeFile(resolve(out, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ artifact: out, companyRuntime: "runtime/company-runtime.json", packages: manifest.dependencies }));

function parse(values) { const result = {}; for (let i=0;i<values.length;i+=2) result[values[i].slice(2)] = values[i+1]; return result; }
