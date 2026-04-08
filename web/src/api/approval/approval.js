import request from "@/utils/request";

const DOCUMENT_TYPE_MAP = {
  1: "StockInOrder",
  2: "StockInOrder",
  3: "WorkshopMaterialOrder",
  5: "WorkshopMaterialOrder",
};

export async function approvalDocument(data) {
  const documentType = DOCUMENT_TYPE_MAP[data.documentType];
  if (!documentType) {
    throw new Error(`未支持的审批 documentType: ${data.documentType}`);
  }

  const approvalResponse = await request({
    url: "/api/approval/documents/detail",
    method: "get",
    params: {
      documentType,
      documentId: data.documentId,
    },
  });

  const approval = approvalResponse.data;
  if (!approval?.id) {
    throw new Error(`未找到审批记录: ${documentType}#${data.documentId}`);
  }

  if (String(data.auditStatus) === "1") {
    return request({
      url: `/api/approval/documents/${approval.id}/approve`,
      method: "post",
    });
  }

  return request({
    url: `/api/approval/documents/${approval.id}/reject`,
    method: "post",
    data: {
      rejectReason: data.rejectReason ?? "legacy page reject action",
    },
  });
}
