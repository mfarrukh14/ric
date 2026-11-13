import {
    Buildings,
    CalendarDots,
    ChartLineUp,
    ClipboardText,
    Coins,
    Envelope,
    FolderOpen,
    Gavel,
    House,
    ListChecks,
    ListMagnifyingGlass,
    Package,
    Receipt,
    Scales,
    SealCheck,
    ShieldCheck,
    Storefront,
    Timer,
    Trophy,
    UserCheck,
    UsersThree,
    Warning,
    Hourglass,
} from '@phosphor-icons/react';

/**
 * What a signed-in person can do, derived once from their account. Everything
 * that used to be a chain of `isStoreDepartmentUser && !isHod` checks reads this.
 */
export function capabilitiesOf(user) {
    const department = String(user?.departmentName || '').toLowerCase();
    const committee = String(user?.committeeName || '').toLowerCase();
    const isHod = user?.isHod === true || user?.isHod === 1;
    return {
        superadmin: user?.role === 'superadmin',
        supplier: user?.role === 'supplier',
        canCreateDemand: Boolean(user?.eligibleForDemandCreation),
        hod: isHod,
        store: department === 'store' && !isHod,
        purchase: department === 'purchase' && !isHod,
        supplierEvaluation: committee === 'supplier evaluation committee',
        technicalEvaluation: committee.includes('technical evaluation'),
        grievance: committee.includes('grievance'),
        vetting: committee.includes('vetting'),
        marketSurvey: committee.includes('market survey'),
    };
}

/** URL slug ↔ the tab ids the dashboards use internally. */
export const ADMIN_TABS = { people: 'management', items: 'items', demands: 'demands', grievances: 'grievances', security: 'security', audit: 'audit' };
export const SUPPLIER_TABS = { overview: 'overview', tenders: 'tenders', bids: 'bids', awards: 'awards', grievances: 'grievances', security: 'security' };
export const PURCHASE_TABS = {
    demands: 'demands',
    letters: 'supply-orders',
    'purchase-orders': 'purchase-orders',
    'tender-opening': 'pending-tenders',
    'financial-opening': 'financial-opening',
    grievances: 'grievance-management',
    'pre-bid-meetings': 'pre-bid-meetings',
    vetting: 'vetting-management',
    'market-survey': 'market-survey',
    'tender-management': 'tender-management',
};

/** Sidebar groups for a person. `badge` keys are filled in live by pages (see navBadges). */
export function navigationFor(user) {
    const can = capabilitiesOf(user);

    if (can.superadmin) {
        return [
            {
                label: 'Administration',
                items: [
                    { to: '/admin/people', label: 'People & teams', icon: UsersThree },
                    { to: '/admin/items', label: 'Item catalogue', icon: Package },
                    { to: '/admin/demands', label: 'Demands', icon: ClipboardText },
                    { to: '/admin/grievances', label: 'Grievance deadlines', icon: Timer },
                ],
            },
            {
                label: 'Oversight',
                items: [
                    { to: '/admin/security', label: 'Security', icon: ShieldCheck },
                    { to: '/admin/audit', label: 'Audit trail', icon: ListMagnifyingGlass },
                ],
            },
        ];
    }

    if (can.supplier) {
        return [
            {
                label: 'Supplier',
                items: [
                    { to: '/supplier/overview', label: 'Overview', icon: House },
                    { to: '/supplier/tenders', label: 'Open tenders', icon: Storefront, badge: 'supplier.tenders' },
                    { to: '/supplier/bids', label: 'My bids', icon: ListChecks },
                    { to: '/supplier/awards', label: 'Awards', icon: Trophy },
                    { to: '/supplier/grievances', label: 'Grievances', icon: Scales },
                ],
            },
            { label: 'Account', items: [{ to: '/supplier/security', label: 'Security', icon: ShieldCheck }] },
        ];
    }

    const groups = [];
    const workspace = [];
    if (can.canCreateDemand) workspace.push({ to: '/demands', label: 'My demands', icon: ClipboardText });
    if (can.hod) workspace.push({ to: '/approvals', label: 'Approvals', icon: SealCheck, badge: 'hod.pending' });
    if (workspace.length) groups.push({ label: 'Workspace', items: workspace });

    if (can.store) {
        groups.push({
            label: 'Store',
            items: [
                { to: '/store/demands', label: 'All demands', icon: Package },
                { to: '/store/purchase-orders', label: 'Purchase orders', icon: Receipt },
            ],
        });
    }

    if (can.purchase) {
        groups.push({
            label: 'Purchase',
            items: [
                { to: '/purchase/demands', label: 'Pending demands', icon: ClipboardText, badge: 'purchase.demands' },
                { to: '/purchase/tender-management', label: 'Tender management', icon: Hourglass },
                { to: '/purchase/vetting', label: 'Vetting', icon: ListChecks },
                { to: '/purchase/pre-bid-meetings', label: 'Pre-bid meetings', icon: CalendarDots },
                { to: '/purchase/tender-opening', label: 'Tender opening', icon: FolderOpen, badge: 'purchase.opening' },
                { to: '/purchase/financial-opening', label: 'Financial opening', icon: Coins, badge: 'purchase.financial' },
                { to: '/purchase/grievances', label: 'Grievances', icon: Warning, badge: 'purchase.grievances' },
                { to: '/purchase/market-survey', label: 'Market survey', icon: ChartLineUp },
                { to: '/purchase/letters', label: 'Letters', icon: Envelope },
                { to: '/purchase/purchase-orders', label: 'Purchase orders', icon: Receipt },
            ],
        });
    }

    const committees = [];
    if (can.supplierEvaluation) committees.push({ to: '/supplier-evaluation', label: 'Supplier evaluation', icon: UserCheck });
    if (can.technicalEvaluation) committees.push({ to: '/technical-evaluation', label: 'Technical evaluation', icon: Buildings });
    if (can.vetting) committees.push({ to: '/vetting', label: 'Tender vetting', icon: ListChecks });
    if (can.grievance) committees.push({ to: '/grievances', label: 'Grievances', icon: Gavel });
    if (can.marketSurvey) committees.push({ to: '/market-survey', label: 'Market survey', icon: ChartLineUp });
    if (committees.length) groups.push({ label: 'Committees', items: committees });

    // Everyone signed in as staff has somewhere to land.
    if (!groups.length) groups.push({ label: 'Workspace', items: [{ to: '/demands', label: 'My demands', icon: ClipboardText }] });

    return groups;
}

export function homePathFor(user) {
    if (!user) return '/login';
    return navigationFor(user)[0].items[0].to;
}

/** A short description of the person's role for the account card. */
export function roleLabel(user) {
    if (!user) return '';
    if (user.role === 'superadmin') return 'Administrator';
    if (user.role === 'supplier') return 'Supplier';
    const parts = [user.isHod ? `Head of ${user.departmentName || 'department'}` : user.departmentName, user.committeeName].filter(Boolean);
    return parts.join(' · ') || 'Staff';
}
