import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowsClockwise, CaretRight, DownloadSimple, ListChecks, ShieldCheck, Storefront } from '@phosphor-icons/react';
import { downloadFile, getMyBids, getOpenTenders, supplierTwoFactor } from '../../config/api';
import GrievanceManagement from './GrievanceManagement';
import TwoFactorSetup from '../auth/TwoFactorSetup/TwoFactorSetup';
import { useRouteTab } from '../../lib/useRouteTab';
import { setNavBadge } from '../../lib/navBadges';
import { toast } from '../../lib/notify';
import { formatDate, formatDateTime } from '../../lib/time';
import { SUPPLIER_TABS } from '../../app/navigation';
import { Badge, Button, EmptyState, LoadingBlock, Notice, PageHeader, Panel, Stat } from '../../ui';
import { money } from '../../ui/status';
import { Countdown, TenderProgress } from '../../ui/tender';
import './supplier.css';

const TITLES = { overview: 'Overview', tenders: 'Open tenders', bids: 'My bids', grievances: 'Grievances', security: 'Security' };

/** Where a bid stands, as computed by the API (`outcome`). */
const OUTCOME = {
    submitted: { label: 'Submitted', tone: 'brand' },
    under_evaluation: { label: 'Under evaluation', tone: 'warning' },
    not_qualified: { label: 'Not qualified', tone: 'danger' },
    not_selected: { label: 'Not selected', tone: 'neutral' },
    won: { label: 'Won', tone: 'success' },
};
const OutcomeBadge = ({ outcome }) => {
    const { label, tone } = OUTCOME[outcome] || OUTCOME.under_evaluation;
    return <Badge tone={tone}>{label}</Badge>;
};

const download = (path, name) => downloadFile(path, name).catch((err) => toast.error(err?.error || 'Download failed'));

function TenderRow({ tender, bid, onApply, onClosed }) {
    return (
        <li className="tender-row">
            <div className="tender-row__main">
                <div className="tender-row__title">
                    <h3>{tender.item_name}</h3>
                    {tender.urgency && tender.urgency !== 'normal' && <Badge tone="warning">{tender.urgency}</Badge>}
                </div>
                <p className="tender-row__meta">
                    {[tender.tender_number, tender.quantity && `Qty ${tender.quantity}`, tender.required_by && `Required by ${formatDate(tender.required_by)}`].filter(Boolean).join(' · ')}
                </p>
                {tender.description && <p className="tender-row__desc">{tender.description}</p>}
                <div className="tender-row__files">
                    <Button size="sm" variant="ghost" icon={<DownloadSimple size={15} />} onClick={() => download(`/demands/tenders/${tender.id}/tender-document`, `tender-${tender.id}.pdf`)}>Tender document</Button>
                    <Button size="sm" variant="ghost" icon={<DownloadSimple size={15} />} onClick={() => download(`/demands/tenders/${tender.id}/items-list`, `items-${tender.id}.csv`)}>Items list</Button>
                </div>
            </div>
            <div className="tender-row__side">
                <span className="tender-row__deadline">Closes {formatDateTime(tender.bidding_end_time)}</span>
                <Countdown until={tender.bidding_end_time} onElapsed={onClosed} />
                {bid ? <Badge tone="brand">Bid submitted</Badge> : <Button variant="primary" onClick={() => onApply(tender)}>Apply</Button>}
            </div>
        </li>
    );
}

function BidRow({ bid }) {
    return (
        <li className="tender-row">
            <div className="tender-row__main">
                <div className="tender-row__title">
                    <h3>{bid.item_name}</h3>
                    <OutcomeBadge outcome={bid.outcome} />
                </div>
                <p className="tender-row__meta">
                    {[bid.tender_number, money(bid.total_cost), bid.proposed_quantity && `${bid.proposed_quantity} units`, bid.delivery_days && `${bid.delivery_days} days delivery`, `Submitted ${formatDate(bid.created_at)}`].filter(Boolean).join(' · ')}
                </p>
                {bid.bid_comments && <p className="tender-row__desc">{bid.bid_comments}</p>}
            </div>
            <div className="tender-row__side tender-row__side--wide">
                <TenderProgress status={bid.tender_status} from="bidding" />
            </div>
        </li>
    );
}

export default function SupplierDashboard() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useRouteTab(SUPPLIER_TABS, 'overview');
    const [tenders, setTenders] = useState([]);
    const [bids, setBids] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [securityOpen, setSecurityOpen] = useState(false);

    const load = useCallback(async () => {
        setError('');
        try {
            const [openTenders, myBids] = await Promise.all([getOpenTenders(), getMyBids()]);
            setTenders(Array.isArray(openTenders) ? openTenders : []);
            setBids(Array.isArray(myBids) ? myBids : []);
        } catch (err) {
            setError(err?.error || 'Failed to load tenders');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { setNavBadge('supplier.tenders', tenders.length); }, [tenders.length]);

    const bidFor = (tenderId) => bids.find((b) => b.tender_id === tenderId);
    const apply = (tender) => navigate(`/supplier/apply-bid/${tender.id}`);

    if (loading) return <LoadingBlock />;

    const awaiting = bids.filter((b) => b.outcome === 'submitted' || b.outcome === 'under_evaluation').length;
    const won = bids.filter((b) => b.outcome === 'won').length;

    return (
        <div className="supplier">
            <PageHeader
                title={TITLES[activeTab] || 'Supplier'}
                actions={['overview', 'tenders', 'bids'].includes(activeTab) && <Button icon={<ArrowsClockwise size={16} />} onClick={() => { setLoading(true); load(); }}>Refresh</Button>}
            />

            {error && <Notice tone="danger" actions={<Button size="sm" variant="ghost" onClick={load}>Retry</Button>}>{error}</Notice>}
            {securityOpen && <TwoFactorSetup client={supplierTwoFactor} onClose={() => setSecurityOpen(false)} />}

            {activeTab === 'overview' && (
                <div className="supplier-overview">
                    <div className="ui-stats stagger">
                        <Stat label="Open tenders" value={tenders.length} tone="brand" />
                        <Stat label="Awaiting result" value={awaiting} tone="warning" />
                        <Stat label="Won" value={won} tone="success" />
                        <Stat label="Bids" value={bids.length} />
                    </div>
                    <div className="supplier-actions stagger">
                        {[
                            { tab: 'tenders', icon: <Storefront size={20} />, title: 'Open tenders' },
                            { tab: 'bids', icon: <ListChecks size={20} />, title: 'My bids' },
                            { tab: 'security', icon: <ShieldCheck size={20} />, title: 'Two-factor authentication' },
                        ].map((action) => (
                            <button key={action.tab} type="button" className="supplier-action" onClick={() => setActiveTab(action.tab)}>
                                <span className="supplier-action__icon">{action.icon}</span>
                                <span className="supplier-action__title">{action.title}</span>
                                <CaretRight size={16} className="supplier-action__go" />
                            </button>
                        ))}
                    </div>
                    <Panel title="Recent bids" flush>
                        {bids.length === 0 ? (
                            <EmptyState icon={<ListChecks size={26} />} title="No bids yet" />
                        ) : (
                            <ul className="tender-list">{bids.slice(0, 5).map((bid) => <BidRow key={bid.id} bid={bid} />)}</ul>
                        )}
                    </Panel>
                </div>
            )}

            {activeTab === 'tenders' && (
                <Panel flush>
                    {tenders.length === 0 ? (
                        <EmptyState icon={<Storefront size={26} />} title="No open tenders" />
                    ) : (
                        <ul className="tender-list">
                            {tenders.map((tender) => <TenderRow key={tender.id} tender={tender} bid={bidFor(tender.id)} onApply={apply} onClosed={load} />)}
                        </ul>
                    )}
                </Panel>
            )}

            {activeTab === 'bids' && (
                <Panel flush>
                    {bids.length === 0 ? (
                        <EmptyState icon={<ListChecks size={26} />} title="No bids yet" />
                    ) : (
                        <ul className="tender-list">{bids.map((bid) => <BidRow key={bid.id} bid={bid} />)}</ul>
                    )}
                </Panel>
            )}

            {activeTab === 'grievances' && <GrievanceManagement />}

            {activeTab === 'security' && (
                <Panel title="Two-factor authentication">
                    <Button variant="primary" icon={<ShieldCheck size={16} />} onClick={() => setSecurityOpen(true)}>Manage</Button>
                </Panel>
            )}
        </div>
    );
}
