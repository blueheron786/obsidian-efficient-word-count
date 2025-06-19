const { Plugin, normalizePath, TFile } = require("obsidian");

module.exports = class WordCountCachePlugin extends Plugin {
  async onload() {
    console.log("Word Count Cache plugin loaded");

    this.cachePath = normalizePath(`${this.manifest.dir}/cache.json`);
    this.wordCounts = {};
    this.excludedFolders = ["Templates", ".trash"];
    this.dirty = false;

    await this.loadCacheFromDisk();

    this.app.workspace.onLayoutReady(() => {
      setTimeout(async () => {
        const files = this.app.vault.getMarkdownFiles();
        if (!files.length) {
          console.warn("No markdown files found. Retrying in 500ms...");
          setTimeout(() => this.buildCacheAndExpose(), 500);
        } else {
          this.buildCacheAndExpose();
        }
      }, 100);
    });

    this.registerEvent(this.app.vault.on("modify", this.handleModify.bind(this)));
    this.registerEvent(this.app.vault.on("delete", this.handleDelete.bind(this)));
    this.registerEvent(this.app.vault.on("rename", this.handleRename.bind(this)));

    // Save cache periodically
    this.saveInterval = window.setInterval(() => this.maybeSaveCache(), 5000);
  }

  onunload() {
    console.log("Word Count Cache plugin unloaded");
    delete window.wordCountCache;
    clearInterval(this.saveInterval);
    this.saveCacheToDisk(); // Final write
  }

  isExcluded(file) {
    return this.excludedFolders.some(folder => file.path.startsWith(folder + "/"));
  }

  async updateFile(file, mtime) {
    if (!(file instanceof TFile) || file.extension !== "md" || this.isExcluded(file)) return;

    const content = await this.app.vault.read(file);
    const body = content.replace(/^---\n[\s\S]*?\n---/, "");
    const count = body.trim().split(/\s+/).filter(w => w.length > 0).length;

    this.wordCounts[file.path] = {
      wordcount: count,
      mtime: mtime ?? (await this.app.vault.adapter.stat(file.path)).mtime
    };
    this.dirty = true;
  }

  async removeFile(file) {
    if (this.wordCounts[file.path]) {
      delete this.wordCounts[file.path];
      this.dirty = true;
    }
  }

  async buildCacheAndExpose() {
    const start = performance.now();
    let updated = 0;
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      if (this.isExcluded(file)) continue;

      const stat = await this.app.vault.adapter.stat(file.path);
      const mtime = stat.mtime;
      const cached = this.wordCounts[file.path];
      if (!cached || cached.mtime !== mtime) {
        await this.updateFile(file, mtime);
        updated++;
      }
    }

    const end = performance.now();
    console.log(`Word count cache built: ${Object.keys(this.wordCounts).length} notes (${updated} updated) in ${(end - start).toFixed(2)} ms`);

    window.wordCountCache = {
      get: path => path ? this.wordCounts[path]?.wordcount : this.wordCounts,
      total: () => Object.values(this.wordCounts).reduce((a, b) => a + (b.wordcount || 0), 0)
    };
  }

  async loadCacheFromDisk() {
    try {
      const exists = await this.app.vault.adapter.exists(this.cachePath);
      if (!exists) return;

      const data = await this.app.vault.adapter.read(this.cachePath);
      this.wordCounts = JSON.parse(data);
      console.log(`Loaded word count cache from disk (${Object.keys(this.wordCounts).length} entries)`);
    } catch (e) {
      console.error("Failed to load word count cache from disk:", e);
    }
  }

  async saveCacheToDisk() {
    try {
      if (!this.dirty) return;
      const data = JSON.stringify(this.wordCounts, null, 2);
      await this.app.vault.adapter.write(this.cachePath, data);
      this.dirty = false;
      console.log("Word count cache saved to disk.");
    } catch (e) {
      console.error("Failed to save word count cache to disk:", e);
    }
  }

  maybeSaveCache() {
    if (this.dirty) {
      this.saveCacheToDisk();
    }
  }

  async handleModify(file) {
    await this.updateFile(file);
  }

  async handleDelete(file) {
    await this.removeFile(file);
  }

  async handleRename(file, oldPath) {
    await this.removeFile({ path: oldPath });
    await this.updateFile(file);
  }
};
