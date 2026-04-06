import request from "@/utils/request";

const DOCUMENT_TYPE_MAP = {
  1: "StockInOrder",
  2: "StockInOrder",
  3: "WorkshopMaterialOrder",
  5: "WorkshopMaterialOrder",
};

// 审核单据
export async function auditDocument(data) {
  const documentType = DOCUMENT_TYPE_MAP[data.documentType];
  if (!documentType) {
    throw new Error(`未支持的审核 documentType: ${data.documentType}`);
  }

  const auditResponse = await request({
    url: "/api/audit/documents/detail",
    method: "get",
    params: {
      documentType,
      documentId: data.documentId,
    },
  });

  const audit = auditResponse.data;
  if (!audit?.id) {
    throw new Error(`未找到审核记录: ${documentType}#${data.documentId}`);
  }

  if (String(data.auditStatus) === "1") {
    return request({
      url: `/api/audit/documents/${audit.id}/approve`,
      method: "post",
    });
  }

  return request({
    url: `/api/audit/documents/${audit.id}/reject`,
    method: "post",
    data: {
      rejectReason: data.rejectReason ?? "legacy page reject action",
    },
  });
}
