import { APPROVAL, INVOICE_STATUS, RO_STATUS, WORK_LABEL } from "@/lib/meta";
import type { Approval, InvoiceStatus, RoStatus, WorkLabel } from "@/lib/types";
import { Badge } from "./ui";

export const RoStatusBadge = ({ status }: { status: RoStatus }) => <Badge tone={RO_STATUS[status].tone}>{RO_STATUS[status].label}</Badge>;

export const WorkLabelBadge = ({ label }: { label: WorkLabel }) =>
  label === "none" ? null : <Badge tone={WORK_LABEL[label].tone}>{WORK_LABEL[label].label}</Badge>;

export const ApprovalBadge = ({ approval }: { approval: Approval }) => <Badge tone={APPROVAL[approval].tone}>{APPROVAL[approval].label}</Badge>;

export const InvoiceBadge = ({ status }: { status: InvoiceStatus }) => <Badge tone={INVOICE_STATUS[status].tone}>{INVOICE_STATUS[status].label}</Badge>;
