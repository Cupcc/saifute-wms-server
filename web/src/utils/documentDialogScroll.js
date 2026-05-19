import { nextTick, unref } from "vue";

function resolveElement(source) {
  const value = unref(source);
  return value?.$el || value;
}

function getScrollableTargets(sourceElement) {
  const linesSection = sourceElement?.closest?.(".document-lines-section");
  const tableBody = linesSection?.querySelector(
    ".el-table__body-wrapper .el-scrollbar__wrap",
  );
  const tableBodyFallback = linesSection?.querySelector(".el-table__body-wrapper");
  const dialogBody = sourceElement?.closest?.(".el-dialog__body");

  return [tableBody, tableBodyFallback, dialogBody].filter(Boolean);
}

function scrollToBottom(element) {
  element.scrollTop = element.scrollHeight;
}

export async function scrollDocumentDialogToBottom(source) {
  await nextTick();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const sourceElement = resolveElement(source);
      const lastRow = sourceElement
        ?.closest?.(".document-lines-section")
        ?.querySelector(".el-table__body-wrapper tbody tr:last-child");

      for (const target of getScrollableTargets(sourceElement)) {
        scrollToBottom(target);
      }

      lastRow?.scrollIntoView({
        block: "end",
        inline: "nearest",
      });
    });
  });
}
