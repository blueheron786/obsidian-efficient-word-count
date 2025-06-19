// main.js - Cleaned version of Efficient Word Count plugin

module.exports = class WordCountCachePlugin extends require("obsidian").Plugin {
  async onload() {
    this.wordCounts = {};
    this.excludedFolders = ["Templates", ".trash"];

    this.app.workspace.onLayoutReady(async () => {
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

    window.wordCountCache = {
      get: (path) => path ? this.wordCounts[path] : this.wordCounts,
      total: () => Object.values(this.wordCounts).reduce((a, b) => a + b, 0)
    };
  }

  onunload() {
    delete window.wordCountCache;
  }

  isExcluded(file) {
    return this.excludedFolders.some(folder => file.path.startsWith(folder + "/"));
  }

  async updateFile(file) {
    if (!(file instanceof require("obsidian").TFile) || file.extension !== "md" || this.isExcluded(file)) return;
    const content = await this.app.vault.read(file);
    const body = content.replace(/^---\n[\s\S]*?\n---/, "");
    const count = body.trim().split(/\s+/).filter(w => w.length > 0).length;
    this.wordCounts[file.path] = count;
  }

  removeFile(file) {
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
};
