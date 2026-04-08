import { getDicts } from "@/api/system/dict/data";
import useDictStore from "@/store/modules/dict";
import request from "@/utils/request";

const LOCAL_DICT_LOADERS = {
  sys_yes_no: async () => [
    { label: "是", value: "1" },
    { label: "否", value: "0" },
  ],
  saifute_customer_type: async () => [
    { label: "一级客户", value: "1" },
    { label: "二级客户", value: "2" },
    { label: "三级客户", value: "3" },
  ],
  related_order_type: async () => [
    { label: "验收单", value: "1" },
    { label: "入库单", value: "2" },
    { label: "领料单", value: "3" },
    { label: "出库单", value: "4" },
    { label: "退料单", value: "5" },
    { label: "报废单", value: "6" },
  ],
  source_type: async () => [{ label: "领料退料", value: "1" }],
  saifute_disposal_method: async () => [
    { label: "直接报废", value: "1" },
    { label: "返修处理", value: "2" },
    { label: "其他处理", value: "3" },
  ],
  scrap_reason: async () => [
    { label: "损坏", value: "1" },
    { label: "质量异常", value: "2" },
    { label: "过期失效", value: "3" },
    { label: "其他", value: "9" },
  ],
  saifute_unit: async () => [
    { label: "个", value: "个" },
    { label: "件", value: "件" },
    { label: "套", value: "套" },
    { label: "台", value: "台" },
    { label: "只", value: "只" },
    { label: "根", value: "根" },
    { label: "条", value: "条" },
    { label: "块", value: "块" },
    { label: "片", value: "片" },
    { label: "张", value: "张" },
    { label: "卷", value: "卷" },
    { label: "箱", value: "箱" },
    { label: "包", value: "包" },
    { label: "袋", value: "袋" },
    { label: "桶", value: "桶" },
    { label: "瓶", value: "瓶" },
    { label: "盒", value: "盒" },
    { label: "米", value: "米" },
    { label: "厘米", value: "厘米" },
    { label: "毫米", value: "毫米" },
    { label: "千克", value: "千克" },
    { label: "克", value: "克" },
    { label: "吨", value: "吨" },
    { label: "升", value: "升" },
    { label: "毫升", value: "毫升" },
    { label: "平方米", value: "平方米" },
    { label: "立方米", value: "立方米" },
  ],
  saifute_material_category: loadMaterialCategoryDict,
};

async function loadMaterialCategoryDict() {
  const rows = [];
  let offset = 0;
  const limit = 100;
  let total = 0;

  do {
    const response = await request({
      url: "/api/master-data/material-categories",
      method: "get",
      params: {
        limit,
        offset,
      },
    });
    const data = response.data || {};
    const items = Array.isArray(data.items) ? data.items : [];
    total = Number(data.total || 0);

    for (const item of items) {
      if (!item?.id) {
        continue;
      }
      rows.push({
        label: item.categoryName,
        value: String(item.id),
      });
    }

    offset += limit;
  } while (offset < total);

  return rows.sort((left, right) =>
    String(left.label).localeCompare(String(right.label)),
  );
}

async function loadFallbackDict(dictType) {
  const loader = LOCAL_DICT_LOADERS[dictType];
  if (!loader) {
    return null;
  }

  return loader();
}

/**
 * 获取字典数据
 */
export function useDict(...args) {
  const res = ref({});
  return (() => {
    args.forEach((dictType, index) => {
      res.value[dictType] = [];
      const dicts = useDictStore().getDict(dictType);
      if (dicts) {
        res.value[dictType] = dicts;
      } else {
        loadFallbackDict(dictType).then((fallback) => {
          if (fallback) {
            res.value[dictType] = fallback;
            useDictStore().setDict(dictType, fallback);
            return;
          }

          getDicts(dictType)
            .then((resp) => {
              res.value[dictType] = resp.data.map((p) => ({
                label: p.dictLabel,
                value: p.dictValue,
                elTagType: p.listClass,
                elTagClass: p.cssClass,
              }));
              useDictStore().setDict(dictType, res.value[dictType]);
            })
            .catch(() => {});
        });
      }
    });
    return toRefs(res.value);
  })();
}
