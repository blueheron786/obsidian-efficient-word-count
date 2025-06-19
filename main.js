const { Plugin, normalizePath, TFile } = require("obsidian");

// For UI cmoponents
const { App, PluginSettingTab, Setting } = require("obsidian");

const DEFAULT_SETTINGS = {
  excludedFolders: ["Templates", ".trash"],
  excludedFiles: []
};

module.exports = class WordCountCachePlugin extends Plugin {
  async onload() {
    console.log("Efficient Word Count plugin loaded");
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.cachePath = normalizePath(`${this.manifest.dir}/cache.json`);
    this.wordCounts = {};
    this.isDirty = false;

    await this.loadCacheFromDisk();

    this.app.workspace.onLayoutReady(() => {
      setTimeout(async () => {
        const files = this.app.vault.getMarkdownFiles();
        if (!files.length) {
          console.warn("No markdown files found. Retrying in 500ms...");
          setTimeout(() => this.buildCacheAndExposeApi(), 500);
        } else {
          this.buildCacheAndExposeApi();
        }
      }, 100);
    });

    this.addSettingTab(new WordCountCacheSettingTab(this.app, this));

    this.registerEvent(this.app.vault.on("modify", this.handleModify.bind(this)));
    this.registerEvent(this.app.vault.on("delete", this.handleDelete.bind(this)));
    this.registerEvent(this.app.vault.on("rename", this.handleRename.bind(this)));

    // Save cache periodically
    this.saveInterval = window.setInterval(() => this.maybeSaveCache(), 5000);
  }

  onunload() {
    console.log("Efficient Word Count plugin unloaded");
    delete window.wordCountCache;
    clearInterval(this.saveInterval);
    this.saveCacheToDisk(); // Final write
  }

  isExcluded(file) {
    const path = file.path.toLowerCase();
    const name = file.name.toLowerCase().replace(/\.md$/, ""); // remove .md

    const excludedFolders = this.settings.excludedFolders.map(f => f.toLowerCase());
    const excludedFiles = this.settings.excludedFiles.map(f => f.toLowerCase());

    const isInExcludedFolders = excludedFolders.some(folder => path.startsWith(folder + "/"));
    const isInExcludedFiles = excludedFiles.includes(name);  // name now has no .md

    return isInExcludedFolders || isInExcludedFiles;
  }


  async updateFile(file, mtime) {
    if (!(file instanceof TFile) || file.extension !== "md" || this.isExcluded(file))
    {
      return;
    };

    const content = await this.app.vault.read(file);
    const body = content.replace(/^---\n[\s\S]*?\n---/, "");
    const count = body.trim().split(/\s+/).filter(w => w.length > 0).length;

    this.wordCounts[file.path] = {
      wordcount: count,
      mtime: mtime ?? (await this.app.vault.adapter.stat(file.path)).mtime
    };

    this.isDirty = true;
    this.refreshGlobalCache();
  }

  async removeFile(file) {
    if (this.wordCounts[file.path]) {
      delete this.wordCounts[file.path];
      this.isDirty = true;
      this.refreshGlobalCache();
    }
  }

  async buildCacheAndExposeApi() {
    const start = performance.now();
    let updated = 0;
    const files = this.app.vault.getMarkdownFiles();

    // Create a set of current file paths for quick lookup
    const currentFilePaths = new Set(files.map(f => f.path));

    // Remove counts for files no longer existing or now excluded
    for (const cachedPath of Object.keys(this.wordCounts)) {
      if (!currentFilePaths.has(cachedPath)) {
        // File deleted
        delete this.wordCounts[cachedPath];
        updated++;
      } else {
        // Check if excluded now
        const file = this.app.vault.getAbstractFileByPath(cachedPath);
        if (file && this.isExcluded(file)) {
          delete this.wordCounts[cachedPath];
          updated++;
        }
      }
    }

    // Update counts for included files
    for (const file of files) {
      if (this.isExcluded(file)) {
        continue;
      }

      const stat = await this.app.vault.adapter.stat(file.path);
      const mtime = stat.mtime;
      const cached = this.wordCounts[file.path];
      if (!cached || cached.mtime !== mtime) {
        await this.updateFile(file, mtime);
        updated++;
      }
    }

    this.isDirty = true;

    const end = performance.now();
    const totalCount = Object.values(this.wordCounts).reduce((a, b) => a + (b.wordcount || 0), 0);


    this.refreshGlobalCache();
  }


  async loadCacheFromDisk() {
    try {
      const exists = await this.app.vault.adapter.exists(this.cachePath);
      if (!exists) return;

      const data = await this.app.vault.adapter.read(this.cachePath);
      this.wordCounts = JSON.parse(data);
    } catch (e) {
      console.error("Failed to load word count cache from disk:", e);
    }
  }

  async saveCacheToDisk() {
    try {
      if (!this.isDirty) return;
      const data = JSON.stringify(this.wordCounts, null, 2);
      await this.app.vault.adapter.write(this.cachePath, data);
      this.isDirty = false;
    } catch (e) {
      console.error("Failed to save word count cache to disk:", e);
    }
  }

  maybeSaveCache() {
    if (this.isDirty) {
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

  async saveSettings() {
    await this.saveData(this.settings);
  }

  refreshGlobalCache() {
    window.wordCountCache = {
      get: path => path ? this.wordCounts[path]?.wordcount : this.wordCounts,
      total: () => Object.values(this.wordCounts).reduce((a, b) => a + (b.wordcount || 0), 0)
    };
  }

};

///////////////////////// ui.js /////////////////////////


class WordCountCacheSettingTab extends PluginSettingTab {

  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Efficient Word Count settings").setHeading();

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc("Folders to exclude from word count")
      .addTextArea(text => {
        text.setValue(this.plugin.settings.excludedFolders.join("\n"));
        text.onChange(async (value) => {
          this.plugin.settings.excludedFolders = value.split("\n").map(s => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
          this.plugin.buildCacheAndExposeApi();
        });
      });

    new Setting(containerEl)
      .setName("Excluded files")
      .setDesc("Files to exclude from word count")
      .addTextArea(text => {
        text.setValue(this.plugin.settings.excludedFiles.join("\n"));
        text.onChange(async (value) => {
          this.plugin.settings.excludedFiles = value.split("\n").map(s => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
          this.plugin.buildCacheAndExposeApi();
        });
      });
  }
}
