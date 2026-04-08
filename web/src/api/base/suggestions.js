import request from "@/utils/request";

const cache = new Map();

/**
 * 获取字段建议值（带缓存，5分钟过期）
 * @param {string} scope - 范围，如 "material"
 * @param {string} field - 字段名，如 "unitCode", "specModel"
 * @returns {Promise<string[]>}
 */
export async function getFieldSuggestions(scope, field) {
  const key = `${scope}:${field}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < 5 * 60 * 1000) {
    return cached.data;
  }

  const response = await request({
    url: "/api/master-data/field-suggestions",
    method: "get",
    params: { scope, field },
  });

  const data = response.data || [];
  cache.set(key, { data, time: Date.now() });
  return data;
}

/** 清除缓存（新增/修改数据后调用） */
export function clearSuggestionsCache(scope, field) {
  if (scope && field) {
    cache.delete(`${scope}:${field}`);
  } else {
    cache.clear();
  }
}
