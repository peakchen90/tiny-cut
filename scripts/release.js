import { execSync } from "child_process";
import { createInterface } from "readline";

function getLatestTag() {
  const result = execSync(
    'git tag --list "v*" --sort=-version:refname',
    { encoding: "utf-8" }
  ).trim();
  if (!result) return null;
  return result.split("\n")[0].replace(/^v/, "");
}

function isValidVersion(version) {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9._-]+)?$/.test(version);
}

function compareVersions(a, b) {
  const pa = a.split("-")[0].split(".").map(Number);
  const pb = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  const hasPreA = a.includes("-");
  const hasPreB = b.includes("-");
  if (hasPreA && !hasPreB) return -1;
  if (!hasPreA && hasPreB) return 1;
  if (hasPreA && hasPreB) return a.localeCompare(b);
  return 0;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function askVersion(latest) {
  while (true) {
    const version = await ask("Enter the version to release: ");

    if (!isValidVersion(version)) {
      console.error(`Invalid version format: "${version}". Expected: x.y.z or x.y.z-pre.release\n`);
      continue;
    }

    if (latest && compareVersions(version, latest) <= 0) {
      console.error(`Version must be greater than ${latest}\n`);
      continue;
    }

    return version;
  }
}

const latest = getLatestTag();

if (latest) {
  console.log(`Latest version: ${latest}`);
} else {
  console.log("No existing version tags found.");
}

const version = await askVersion(latest);
const tag = `v${version}`;

const confirm = await ask(`Create tag ${tag} and push? [Y/n] `);
if (confirm && confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
  console.log("Cancelled.");
  process.exit(0);
}

console.log(`Creating tag: ${tag}`);
execSync(`git tag ${tag}`, { stdio: "inherit" });
console.log(`Tag ${tag} created.`);

console.log(`Pushing tag ${tag} to remote...`);
execSync(`git push origin ${tag}`, { stdio: "inherit" });
console.log(`Tag ${tag} pushed.`);
