import { Plugin, TFile, Vault } from "obsidian";

export default class WordCountCachePlugin extends Plugin {
  private wordCounts: Record<string, number> = {};
  private excludedFolders: string[] = ["Templates", ".trash"];

  async onload() {
    this.app.workspace.onLayoutReady(async () => {
      const start = performance.now();
      await this.buildCache();
      const end = performance.now();
      console.log(
        `Word count cache built over ${Object.keys(this.wordCounts).length} notes in ${(end - start).toFixed(2)} ms`
      );
    });

    this.registerEvent(this.app.vault.on("modify", this.updateFile.bind(this)));
    this.registerEvent(this.app.vault.on("delete", this.removeFile.bind(this)));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.removeFile({ path: oldPath } as TFile);
        this.updateFile(file);
      })
    );

    // Expose the API
    (window as any).wordCountCache = {
      get: (path?: string) => (path ? this.wordCounts[path] : this.wordCounts),
      total: () =>
        Object.values(this.wordCounts).reduce((a, b) => a + b, 0),
    };
  }

  onunload() {
    delete (window as any).wordCountCache;
  }

  private isExcluded(file: TFile): boolean {
    return this.excludedFolders.some((folder) =>
      file.path.startsWith(folder + "/")
    );
  }

  private async updateFile(file: TFile) {
    if (file.extension !== "md" || this.isExcluded(file)) return;
    const content = await this.app.vault.read(file);
    const body = content.replace(/^---\n[\s\S]*?\n---/, "");
    const count = body.trim().split(/\s+/).filter((w) => w.length > 0).length;
    this.wordCounts[file.path] = count;
  }

  private removeFile(file: TFile) {
    if (file.path in this.wordCounts) {
      delete this.wordCounts[file.path];
    }
  }

  private async buildCache() {
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (!this.isExcluded(file)) {
        await this.updateFile(file);
      }
    }
  }
}
