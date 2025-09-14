const MODULE_ID = "delta-green-book-style";
const TYPE = "agent";
const SETTING_KEY = "deltagreen.characterSheetStyle";
const TEMPLATE = `modules/${MODULE_ID}/templates/book-style-actor/actor-sheet.html`;

function showAddCustomItemModal(event, target) {
  const sheet = this; // App V2 instance
  const actor = sheet.actor;
  if (!actor) return;

  const types = [
    { value: "tome", label: game.i18n.localize("DG.Gear.Tomes") },
    { value: "ritual", label: game.i18n.localize("DG.Gear.Rituals") },
    { value: "gear", label: game.i18n.localize("DG.Gear.OtherGear") },
  ];

  const content = `
    <form>
      <div class="form-group">
        <label>${game.i18n.localize("DG.Generic.Type") || "Type"}</label>
        <select name="type">
          ${types
            .map((t) => `<option value="${t.value}">${t.label}</option>`)
            .join("")}
        </select>
      </div>
    </form>
  `;

  const dlg = new Dialog({
    title: game.i18n.localize("DG.Generic.AddItem"),
    content,
    buttons: {
      create: {
        icon: '<i class="fas fa-check"></i>',
        label: game.i18n.localize("DG.Generic.Create"),
        callback: async (html) => {
          const type = html.find('[name="type"]').val();
          const name = html.find('[name="name"]').val()?.trim();

          // Prefer the system's own flow (same as clicking the built-in "create" link)
          if (typeof sheet._onItemCreate === "function") {
            // Some systems accept an options object for preset name; harmless if ignored.
            await sheet._onItemCreate(type, { name });
            return;
          }

          // Fallback: mimic your itemAction route (works with your custom handler)
          try {
            const fakeTarget = document.createElement("a");
            fakeTarget.dataset.actionType = "create";
            fakeTarget.dataset.itemType = type;
            await customOnItemAction.call(
              sheet,
              new Event("click"),
              fakeTarget
            );
          } catch (e) {
            // Last-resort direct create if neither path exists
            const payload = [{ type, ...(name ? { name } : {}) }];
            const [doc] = await actor.createEmbeddedDocuments("Item", payload);
            doc?.sheet?.render(true);
          }
        },
      },
      cancel: { label: game.i18n.localize("Cancel") },
    },
    default: "create",
  }).render(true);

  // One-time hook for THIS dialog instance
  Hooks.once("renderDialog", (app, elOr$) => {
    if (app.appId !== dlg.appId) return; // ignore other dialogs
    const root = elOr$ instanceof HTMLElement ? elOr$ : elOr$?.[0];
    const wc = root?.querySelector("section.window-content");
    wc?.classList.add("book-style", "modal-content", "m-h-110"); // add your classes here
  });

  dlg.render(true);
}

Hooks.once("setup", () => {
  // Add "book" to the system's existing setting
  const def = game.settings.settings.get(SETTING_KEY);
  if (def?.choices && !def.choices.book) {
    def.choices = { ...def.choices, book: "Book Style (Original)" };
  }

  // Register missing Handlebars helpers
  Handlebars.registerHelper("mod", function (a, b) {
    return a % b;
  });

  Handlebars.registerHelper("length", function (array) {
    return array ? array.length : 0;
  });

  Handlebars.registerHelper("subtract", function (a, b) {
    return a - b;
  });

  Handlebars.registerHelper(
    "sort",
    function (array, property, descending = false) {
      // Convert Foundry collections to arrays
      if (array && typeof array.values === "function") {
        // EmbeddedCollection has .values() method
        array = Array.from(array.values());
      } else if (array && typeof array.toArray === "function") {
        array = array.toArray();
      } else if (!Array.isArray(array)) {
        console.log("Error with sorting - Not an array or collection:", array);
        return array;
      }

      const sorted = array.slice().sort((a, b) => {
        let aVal = foundry.utils.getProperty(a, property);
        let bVal = foundry.utils.getProperty(b, property);

        // Handle boolean values - true comes first if descending
        if (typeof aVal === "boolean" && typeof bVal === "boolean") {
          if (descending) {
            return bVal - aVal; // true (1) comes before false (0)
          } else {
            return aVal - bVal; // false (0) comes before true (1)
          }
        }

        // Handle other types
        if (aVal < bVal) return descending ? 1 : -1;
        if (aVal > bVal) return descending ? -1 : 1;
        return 0;
      });

      return sorted;
    }
  );

  Handlebars.registerHelper("add", (a, b) => Number(a) + Number(b));
  Handlebars.registerHelper("mul", (a, b) => Number(a) * Number(b));
  Handlebars.registerHelper("floorDiv", (a, b) =>
    Math.floor(Number(a) / Number(b))
  );
  Handlebars.registerHelper("ceilDiv", (a, b) =>
    Math.ceil(Number(a) / Number(b))
  );
  Handlebars.registerHelper("range", (n) =>
    Array.from({ length: Number(n) || 0 }, (_, i) => i)
  );
  Handlebars.registerHelper("min", (a, b) => Math.min(Number(a), Number(b)));
  Handlebars.registerHelper("if_gt", (a, b) => Number(a) > Number(b));

  // Register helper to calculate skill index for column-major layout
  Handlebars.registerHelper("skillIndex", function (displayIndex, totalSkills) {
    const cols = 4;
    const rows = Math.ceil(totalSkills / cols);

    // Calculate which column and row this display position represents
    const col = displayIndex % cols;
    const row = Math.floor(displayIndex / cols);

    // Calculate the source index using column-major order
    // In column-major: sourceIndex = row + col * rows
    const sourceIndex = row + col * rows;

    // Return the source index if it's within bounds
    return sourceIndex < totalSkills ? sourceIndex : -1;
  });

  Handlebars.registerHelper("lte", function (a, b) {
    return Number(a) <= Number(b);
  });
});

// Hook to ensure book-style class is applied when sheets are rendered
Hooks.on("renderItemSheet", (app, elOr$) => {
  try {
    const style = game.settings.get("deltagreen", "characterSheetStyle");
    if (style !== "book") return;

    // Normalize to a DOM node (works for HTMLElement or jQuery)
    const el =
      elOr$ instanceof HTMLElement
        ? elOr$
        : (elOr$ && elOr$[0]) ||
          (app.element && (app.element[0] || app.element));

    if (!el) return;

    // Find the content container in a DOM-safe way
    const container = el.matches?.("section.window-content")
      ? el
      : el.querySelector?.("section.window-content") ||
        el
          .closest?.(".app.window-app")
          ?.querySelector?.("section.window-content");

    if (!container) return;

    if (!container.classList.contains("book-style")) {
      container.classList.add("book-style", "modal-content");
    }
  } catch (err) {
    console.error(`${MODULE_ID}: renderItemSheet hook error`, err);
  }
});

Hooks.once("ready", () => {
  const reg = CONFIG.Actor?.sheetClasses?.[TYPE];
  if (!reg)
    return console.error(`${MODULE_ID} no sheet registry for type "${TYPE}"`);

  const dgKey =
    Object.keys(reg).find((k) => /deltagreen\.DGAgentSheet/i.test(k)) ??
    Object.keys(reg)[0];
  const Base = reg[dgKey]?.cls;
  if (!Base)
    return console.error(`${MODULE_ID} could not resolve base from`, dgKey);

  /**
   * Custom _onItemAction method that handles different DOM structures
   * Uses Application V2 approach with bound `this` context
   * @param {Event} event - The originating click event
   * @param {HTMLElement} target - The clicked element
   */
  function customOnItemAction(event, target) {
    // `this` is the sheet instance (ApplicationV2)
    const sheet = this;

    // Root element (HTMLElement in V2, not jQuery)
    const root = sheet.element;
    if (!root) {
      console.error(`${MODULE_ID}: sheet.element is not available`);
      return;
    }

    // Find the specific sheet element
    const sheetElement = target.closest("form.sheet.deltagreen");
    if (!sheetElement) {
      console.error(`${MODULE_ID}: Could not find sheet element`);
      return;
    }

    // Detect if THIS specific sheet is using book style
    const sheet_type = sheetElement
      .querySelector("section.window-content")
      ?.classList.contains("book-style");

    // Pick the correct row element depending on style
    const li = sheet_type ? target.closest("tr") : target.closest(".item");
    if (!li) {
      console.error(
        `${MODULE_ID}: Could not resolve item container from click`
      );
      return;
    }

    const itemId = li.dataset.itemId;
    const { actionType, itemType } = target.dataset || {};

    // Safety checks
    if (!actionType) return;
    if ((actionType === "edit" || actionType === "delete") && !itemId) {
      console.error(`${MODULE_ID}: Missing itemId for action "${actionType}"`);
      return;
    }

    switch (actionType) {
      case "create": {
        // Delegate to the base sheet's create handler
        if (typeof sheet._onItemCreate === "function")
          sheet._onItemCreate(itemType);
        else console.error(`${MODULE_ID}: _onItemCreate not found on sheet`);
        break;
      }
      case "edit": {
        const item = sheet.actor?.items?.get(itemId);
        if (!item) return console.error(`${MODULE_ID}: No item for id`, itemId);
        item.sheet?.render(true);
        break;
      }
      case "delete": {
        sheet.actor?.deleteEmbeddedDocuments("Item", [itemId]);
        break;
      }
      default:
        // no-op for unknown actions
        break;
    }
  }

  class BookStyleAgentSheet extends Base {
    // V2 Application uses static DEFAULT_OPTIONS, not defaultOptions getter
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
      super.DEFAULT_OPTIONS ?? {},
      {
        classes: [
          "deltagreen",
          "sheet",
          "actor",
          "dg-original-style",
          "dg-style-book",
        ],
        position: { width: 1025, height: 770 },
        submitOnChange: true, // autosave on any change
        closeOnSubmit: false, // don't close the sheet on submit
        submitButton: true, // ensure there's a submit control if your form lacks one
        actions: {
          // Override the itemAction to use our custom handler
          itemAction: customOnItemAction,
          showAddCustomItemModal,
        },
      }
    );

    // Force the form selector (helps if your template structure differs)
    static FORM_SELECTOR = "form.sheet";

    // Replace the system's PARTS with a single root part that points to YOUR .html
    static PARTS = {
      root: {
        template: TEMPLATE,
        // optional: if your template includes smaller partials, list them here
        // templates: [ `modules/${MODULE_ID}/templates/partials/something.html` ],
        // optional: selectors you want to auto-mark scrollable (for AppV2 conveniences)
        scrollable: [".window-content", ".sheet-body"],
      },
    };

    // Force only our "root" part to render when style === "book"
    _configureRenderOptions(options) {
      super._configureRenderOptions(options);
      if (game.settings.get("deltagreen", "characterSheetStyle") === "book") {
        options.parts = ["root"];
      }
    }

    // Override _updateObject to log form submissions for debugging
    async _updateObject(event, formData) {
      return super._updateObject?.(event, formData);
    }

    _sortSkills() {
      // fill an array that is sorted based on the appropriate localized entry
      const sortedSkills = [];
      for (const [key, skill] of Object.entries(this.actor.system.skills)) {
        skill.key = key;

        if (game.i18n.lang === "ja") {
          skill.sortLabel = game.i18n.localize(`DG.Skills.ruby.${key}`);
        } else {
          skill.sortLabel = game.i18n.localize(`DG.Skills.${key}`);
        }

        if (skill.sortLabel === "" || skill.sortLabel === `DG.Skills.${key}`) {
          skill.sortLabel = skill.key;
        }

        // if the actor is an NPC or Unnatural, and they have 'hide untrained skills' active,
        // it will break the sorting logic, so we have to skip over these
        if (
          !(
            (this.actor.type === "npc" || this.actor.type === "unnatural") &&
            this.actor.system.showUntrainedSkills &&
            skill.proficiency < 1
          )
        ) {
          sortedSkills.push(skill);
        }
      }

      sortedSkills.sort((a, b) => {
        return a.sortLabel.localeCompare(b.sortLabel, game.i18n.lang);
      });

      // if sorting by columns, re-arrange the array to be columns first, then rows
      if (game.settings.get("deltagreen", "sortSkills")) {
        const columnSortedSkills = this.reorderForColumnSorting(
          sortedSkills,
          4
        ); // changed to 4 to follow the new layout
        this.actor.system.sortedSkills = columnSortedSkills;
      } else {
        this.actor.system.sortedSkills = sortedSkills;
      }
      console.log(this.actor.system.sortedSkills);
    }

    async _prepareContext(options) {
      const ctx = await super._prepareContext(options);
      // read the setting once and expose to the template
      ctx.sortSkills = game.settings.get("deltagreen", "sortSkills"); // boolean
      return ctx;
    }
  }

  // Register (V13+ namespace first; fall back if needed)
  const DSC =
    foundry?.applications?.apps?.DocumentSheetConfig ||
    globalThis.DocumentSheetConfig;
  const makeDefault =
    game.settings.get("deltagreen", "characterSheetStyle") === "book";

  if (DSC?.registerSheet) {
    DSC.registerSheet(Actor, MODULE_ID, BookStyleAgentSheet, {
      types: [TYPE],
      label: "Book Style (Original)",
      makeDefault,
    });
  } else {
    Actors.registerSheet(MODULE_ID, BookStyleAgentSheet, {
      types: [TYPE],
      label: "Book Style (Original)",
      makeDefault,
    });
  }

  Hooks.on("updateSetting", (setting) => {
    // Re-render all open actor sheets when setting changes
    // PARTS selection happens in _configureRenderOptions
    for (const app of Object.values(ui.windows)) {
      if (app.actor?.type === TYPE) {
        app.render(true);
      }
    }
  });
});
