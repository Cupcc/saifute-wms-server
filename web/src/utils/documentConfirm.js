import { ElMessageBox } from "element-plus";

function getDocumentName(documentName) {
  const value = String(documentName || "单据").trim();
  return value.replace(/^该/, "") || "单据";
}

export async function confirmDocumentSave({
  documentName = "单据",
  isUpdate = false,
} = {}) {
  const normalizedDocumentName = getDocumentName(documentName);
  const content = isUpdate
    ? `确认保存对该${normalizedDocumentName}的修改吗？`
    : `确认保存该${normalizedDocumentName}吗？`;

  try {
    await ElMessageBox.confirm(content, "系统提示", {
      confirmButtonText: "确定保存",
      cancelButtonText: "取消",
      type: "warning",
    });
    return true;
  } catch {
    return false;
  }
}
