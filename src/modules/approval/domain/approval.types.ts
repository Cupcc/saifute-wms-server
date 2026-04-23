import type { DocumentFamily } from "../../../../generated/prisma/client";

export interface CreateApprovalDocumentCommand {
  documentFamily: DocumentFamily;
  documentType: string;
  documentId: number;
  documentNumber: string;
  submittedBy?: string;
  createdBy?: string;
}
