import { timeLeft } from './time';

/**
 * One vocabulary for a tender's state, used on every screen. The stored codes are historical
 * ("expired" means opened and with the technical committee), so screens never show them raw.
 */
const STATUS = {
    pending_purchase_hod_approval: { label: 'Awaiting purchase HOD', phase: 'approval', tone: 'warning' },
    purchase_hod_rejected: { label: 'Rejected by purchase HOD', phase: 'approval', tone: 'danger' },
    pending_vetting: { label: 'In vetting', phase: 'approval', tone: 'warning' },
    vetting_approved: { label: 'Vetted', phase: 'approval', tone: 'warning' },
    vetting_rejected: { label: 'Rejected in vetting', phase: 'approval', tone: 'danger' },
    pending_finance_ms_approval: { label: 'Awaiting Finance & MS', phase: 'approval', tone: 'warning' },
    finance_rejected: { label: 'Rejected by Finance', phase: 'approval', tone: 'danger' },
    ms_rejected: { label: 'Rejected by MS', phase: 'approval', tone: 'danger' },
    pending_purchase_hod_publishing: { label: 'Ready to publish', phase: 'approval', tone: 'warning' },
    published: { label: 'Open for bids', phase: 'bidding', tone: 'success' },
    active: { label: 'Open for bids', phase: 'bidding', tone: 'success' },
    pending_opening: { label: 'Bidding closed', phase: 'opening', tone: 'neutral' },
    expired: { label: 'Technical evaluation', phase: 'technical', tone: 'brand' },
    technically_evaluated: { label: 'Financial evaluation', phase: 'financial', tone: 'brand' },
    awarded: { label: 'Awarded', phase: 'award', tone: 'success' },
};

export const TENDER_PHASES = [
    { key: 'approval', label: 'Approval' },
    { key: 'bidding', label: 'Bidding' },
    { key: 'opening', label: 'Opening' },
    { key: 'technical', label: 'Technical' },
    { key: 'financial', label: 'Financial' },
    { key: 'award', label: 'Award' },
];

const fallback = (status) => ({ label: String(status || 'Unknown').replace(/_/g, ' '), phase: null, tone: 'neutral' });
export const tenderStatus = (status) => STATUS[status] || fallback(status);
export const tenderStatusLabel = (status) => tenderStatus(status).label;

/** Bidding is open: published and the deadline is still ahead. */
export const isOpenForBids = (tender, now = Date.now()) =>
    ['active', 'published'].includes(tender?.tender_status) && timeLeft(tender?.bidding_end_time, now) !== 'Closed';
