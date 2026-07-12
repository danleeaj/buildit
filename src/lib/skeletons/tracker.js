// tracker.js — Skeleton #1: list + add form + computed summary.
// The model never writes this code; it only supplies the config object.
// Every region has a data-component tag = the hit-test map for draw-to-edit.

export function renderTracker(config) {
  const cfg = JSON.stringify(config);
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<script src="https://cdn.tailwindcss.com"><\/script>
<script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"><\/script>
<style>
  :root { --brand: ${config.brand || "#6366f1"}; }
  .brand { background-color: var(--brand); }
  .brand-text { color: var(--brand); }
  * { -webkit-tap-highlight-color: transparent; }
</style>
</head>
<body class="bg-gray-50 min-h-screen" x-data="app()">
<div class="max-w-md mx-auto min-h-screen flex flex-col pb-32">

  <header data-component="Header" class="px-5 pt-8 pb-5">
    <h1 class="text-2xl font-bold text-gray-900" x-text="config.appName"></h1>
    <p class="text-sm text-gray-500 mt-0.5" x-text="config.tagline"></p>
  </header>

  <section data-component="Summary" class="px-5 pb-4">
    <div class="brand rounded-2xl p-5 text-white shadow-sm">
      <p class="text-xs uppercase tracking-wide opacity-80" x-text="config.summary.label"></p>
      <p class="text-3xl font-bold mt-1" x-text="summaryValue()"></p>
    </div>
  </section>

  <main data-component="ItemList" class="px-5 flex-1 space-y-3">
    <template x-for="(item, i) in items" :key="i">
      <div class="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between">
        <div>
          <p class="font-semibold text-gray-900" x-text="item[config.fields[0].key]"></p>
          <p class="text-sm text-gray-500" x-text="subline(item)"></p>
        </div>
        <button @click="items.splice(i,1)" class="text-gray-300 text-xl px-2">&times;</button>
      </div>
    </template>
    <p x-show="items.length === 0" class="text-center text-gray-400 text-sm py-8">
      Nothing yet — add your first <span x-text="config.itemNoun"></span> below.
    </p>
  </main>

  <div data-component="AddForm" class="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.06)] p-5">
    <div class="grid grid-cols-2 gap-3 mb-3">
      <template x-for="f in config.fields">
        <div :class="config.fields.length % 2 && f === config.fields[0] ? 'col-span-2' : ''">
          <label class="text-xs text-gray-500" x-text="f.label"></label>
          <template x-if="f.type === 'select'">
            <select x-model="draft[f.key]" class="w-full bg-gray-100 rounded-xl px-3 py-2.5 mt-1 text-sm">
              <template x-for="o in f.options"><option x-text="o"></option></template>
            </select>
          </template>
          <template x-if="f.type !== 'select'">
            <input :type="f.type" x-model="draft[f.key]"
                   class="w-full bg-gray-100 rounded-xl px-3 py-2.5 mt-1 text-sm">
          </template>
        </div>
      </template>
    </div>
    <button @click="add()" class="brand w-full text-white rounded-full py-3.5 font-semibold active:scale-95 transition-transform">
      Add <span x-text="config.itemNoun"></span>
    </button>
  </div>

</div>

<script>
function app() {
  return {
    config: ${cfg},
    items: ${JSON.stringify(config.seedItems || [])},
    draft: {},
    add() {
      const required = this.config.fields[0].key;
      if (!this.draft[required]) return;
      this.items.unshift({ ...this.draft });
      this.draft = {};
    },
    subline(item) {
      return this.config.fields.slice(1)
        .map(f => item[f.key]).filter(Boolean).join(" \\u00b7 ");
    },
    summaryValue() {
      const s = this.config.summary;
      if (s.type === "sum" && s.field) {
        const total = this.items.reduce((a, it) => a + (parseFloat(it[s.field]) || 0), 0);
        return "$" + total.toFixed(2);
      }
      return this.items.length;
    },
  };
}
<\/script>
</body>
</html>`;
}
