import { Prisma, type RdMaterialStatusLedger } from "../../../../generated/prisma/client";
import type { RequestLineStatusProjection, ReverseBySourceDocumentInput } from "./rd-material-status-core.helper";

export function formatStatusBuckets(
  projection:
    | RequestLineStatusProjection
    | Pick<
        RdMaterialStatusLedger,
        | "pendingQty"
        | "inProcurementQty"
        | "canceledQty"
        | "acceptedQty"
        | "handedOffQty"
        | "scrappedQty"
        | "returnedQty"
      >,
) {
  return {
    pendingQty: projection.pendingQty,
    inProcurementQty: projection.inProcurementQty,
    canceledQty: projection.canceledQty,
    acceptedQty: projection.acceptedQty,
    handedOffQty: projection.handedOffQty,
    scrappedQty: projection.scrappedQty,
    returnedQty: projection.returnedQty,
  };
}
export type { RequestLineStatusProjection, ReverseBySourceDocumentInput };

