const LEGACY_PERMISSION_ALIAS_MAP = {
  "master:material-category:list": ["base:materialCategory:list"],
  "master:material-category:create": ["base:materialCategory:add"],
  "master:material-category:update": ["base:materialCategory:edit"],
  "master:material-category:deactivate": ["base:materialCategory:remove"],
  "master:material:list": ["base:material:list"],
  "master:material:create": ["base:material:add"],
  "master:material:update": ["base:material:edit"],
  "master:material:deactivate": ["base:material:remove"],
  "master:customer:list": ["base:customer:list"],
  "master:customer:create": ["base:customer:add"],
  "master:customer:update": ["base:customer:edit"],
  "master:customer:deactivate": ["base:customer:remove"],
  "master:supplier:list": ["base:supplier:list"],
  "master:supplier:create": ["base:supplier:add"],
  "master:supplier:update": ["base:supplier:edit"],
  "master:supplier:deactivate": ["base:supplier:remove"],
  "master:personnel:list": ["base:personnel:list"],
  "master:personnel:create": ["base:personnel:add"],
  "master:personnel:update": ["base:personnel:edit"],
  "master:personnel:deactivate": ["base:personnel:remove"],
  "master:workshop:list": ["base:workshop:list"],
  "master:workshop:create": ["base:workshop:add"],
  "master:workshop:update": ["base:workshop:edit"],
  "master:workshop:deactivate": ["base:workshop:remove"],
  "master:stock-scope:list": ["base:stockScope:list"],
  "master:stock-scope:create": ["base:stockScope:add"],
  "master:stock-scope:update": ["base:stockScope:edit"],
  "master:stock-scope:deactivate": ["base:stockScope:remove"],
  "inbound:order:list": ["entry:order:list", "entry:detail:list"],
  "inbound:order:create": ["entry:order:add"],
  "inbound:order:update": ["entry:order:edit"],
  "inbound:order:void": ["entry:order:remove"],
  "inbound:into-order:list": ["entry:intoOrder:list", "entry:intoDetail:list"],
  "inbound:into-order:create": ["entry:intoOrder:add"],
  "inbound:into-order:update": ["entry:intoOrder:edit"],
  "inbound:into-order:void": ["entry:intoOrder:remove"],
  "workshop-material:pick-order:list": [
    "take:pickOrder:list",
    "take:pickDetail:list",
  ],
  "workshop-material:pick-order:create": ["take:pickOrder:add"],
  "workshop-material:pick-order:update": ["take:pickOrder:edit"],
  "workshop-material:pick-order:void": ["take:pickOrder:remove"],
  "workshop-material:return-order:list": [
    "take:returnOrder:list",
    "take:returnDetail:list",
  ],
  "workshop-material:return-order:create": ["take:returnOrder:add"],
  "workshop-material:return-order:update": ["take:returnOrder:edit"],
  "workshop-material:return-order:void": ["take:returnOrder:remove"],
  "workshop-material:scrap-order:list": [
    "stock:scrapOrder:list",
    "stock:scrapDetail:list",
  ],
  "workshop-material:scrap-order:create": ["stock:scrapOrder:add"],
  "workshop-material:scrap-order:update": ["stock:scrapOrder:edit"],
  "workshop-material:scrap-order:void": ["stock:scrapOrder:remove"],
  "inventory:balance:list": ["stock:inventory:list", "stock:warning:list"],
  "inventory:factory-number:list": ["stock:interval:list"],
  "inventory:log:list": ["stock:log:list"],
  "inventory:source-usage:list": ["stock:used:list"],
};

export function expandPermissionAliases(permissions = []) {
  const expanded = new Set(
    Array.isArray(permissions) ? permissions.filter(Boolean) : [],
  );

  for (const permission of expanded) {
    const aliases = LEGACY_PERMISSION_ALIAS_MAP[permission];
    if (!aliases) {
      continue;
    }

    for (const alias of aliases) {
      expanded.add(alias);
    }
  }

  return [...expanded];
}
