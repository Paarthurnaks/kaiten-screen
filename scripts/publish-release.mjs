// electron-builder всегда публикует релиз черновиком (draft) — этот скрипт снимает флаг
// draft, чтобы релиз стал видимым публично и electron-updater смог его найти. Запускается
// после `electron-builder --publish always` (см. "release" в package.json).
//
// В этом окружении electron-builder периодически создаёт ДВА отдельных черновика с одним
// и тем же тегом за один прогон (гонка при параллельной заливке нескольких ассетов —
// каждый параллельный upload-таск проверяет "существует ли релиз" одновременно, оба не
// находят его и оба создают свой). Поэтому скрипт не просто публикует первый попавшийся
// черновик, а сначала схлопывает дубли: оставляет тот, где больше ассетов (там точно есть
// .exe), остальные удаляет.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
const tag = `v${pkg.version}`;

const token = process.env.GH_TOKEN;
if (!token) {
  console.error("GH_TOKEN не задан — не могу опубликовать релиз.");
  process.exit(1);
}

const owner = "Paarthurnaks";
const repo = "kaiten-screen";
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "kaiten-screen-release-script",
};

async function listReleases() {
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, { headers });
  if (!resp.ok) {
    throw new Error(`Не удалось получить список релизов: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

async function deleteRelease(id) {
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${id}`, {
    method: "DELETE",
    headers,
  });
  if (!resp.ok) {
    throw new Error(`Не удалось удалить дубль релиза id=${id}: ${resp.status} ${await resp.text()}`);
  }
}

async function publishRelease(id) {
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ draft: false }),
  });
  if (!resp.ok) {
    throw new Error(`Не удалось опубликовать релиз id=${id}: ${resp.status} ${await resp.text()}`);
  }
}

const releases = await listReleases();
const candidates = releases.filter((r) => r.tag_name === tag && r.draft);

if (candidates.length === 0) {
  const alreadyPublished = releases.find((r) => r.tag_name === tag && !r.draft);
  if (alreadyPublished) {
    console.log(`Релиз ${tag} уже опубликован: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
    process.exit(0);
  }
  console.error(`Черновик релиза с тегом ${tag} не найден — сборка не создала релиз?`);
  process.exit(1);
}

candidates.sort((a, b) => b.assets.length - a.assets.length);
const [keep, ...duplicates] = candidates;

for (const dup of duplicates) {
  console.log(`Удаляю дубль-черновик id=${dup.id} (${dup.assets.length} ассет(а/ов))`);
  await deleteRelease(dup.id);
}

console.log(`Публикую релиз id=${keep.id} (${keep.assets.length} ассет(а/ов): ${keep.assets.map((a) => a.name).join(", ")})`);
await publishRelease(keep.id);

console.log(`Релиз ${tag} опубликован: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
