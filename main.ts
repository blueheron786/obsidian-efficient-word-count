import { Plugin, TFile } from "obsidian";

interface WordCountCacheAPI {
  get(path?: string): number | Record<string, number>;
  total(): number;
}

export default class WordCountCachePlugin extends Plugin {
  wordCounts: Record<string, number> = {};
  excludedFolders = ["Templates", ".trash"];

  async onload() {
    console.log("Word Count Cache plugin loaded");

    this.app.workspace.onLayoutReady(async () => {
      console.log("Vault ready. Starting word count cache build...");
      const start = performance.now();
      await this.buildCache();
      const end = performance.now();
      console.log(`Word count cache built over ${Object.keys(this.wordCounts).length} notes in ${(end - start).toFixed(2)} ms`);
    });

    this.registerEvent(this.app.vault.on("modify", this.updateFile.bind(this)));
    this.registerEvent(this.app.vault.on("delete", this.removeFile.bind(this)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.removeFile({ path: oldPath });
      this.updateFile(file);
    }));

    // Expose global API
    (window as any).wordCountCache = {
      get: (path?: string) => path ? this.wordCounts[path] : this.wordCounts,
      total: () => Object.values(this.wordCounts).reduce((a, b) => a + b, 0),
    } as WordCountCacheAPI;
  }

  onunload() {
    console.log("Word Count Cache plugin unloaded");
    delete (window as any).wordCountCache;
  }

  isExcluded(file: TFile): boolean {
    return this.excludedFolders.some(folder => file.path.startsWith(folder + "/"));
  }

  async updateFile(file: TFile) {
    if (!(file instanceof TFile) || file.extension !== "md" || this.isExcluded(file)) return;
    const content = await this.app.vault.read(file);
    const body = content.replace(/^---\n[\s\S]*?\n---/, "");
    const count = body.trim().split(/\s+/).filter(w => w.length > 0).length;
    this.wordCounts[file.path] = count;
  }

  removeFile(file: { path: string }) {
    if (file.path in this.wordCounts) {
      delete this.wordCounts[file.path];
    }
  }

  async buildCache() {
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (!this.isExcluded(file)) {
        await this.updateFile(file);
      }
    }
  }
}
