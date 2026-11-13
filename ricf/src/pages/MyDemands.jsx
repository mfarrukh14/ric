import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowsClockwise, CheckCircle, ClipboardText, Hourglass, MagnifyingGlass, Plus, XCircle } from '@phosphor-icons/react';
import { apiUrl, authHeaders } from '../config/api';
import { Button, EmptyState, LoadingBlock, Notice, PageHeader, Segmented, Stat } from '../ui';
import { date, money, StatusBadge, statusTone, UrgencyBadge } from '../ui/status';
import './my-demands.css';

const FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'warning', label: 'In progress' },
    { value: 'success', label: 'Fulfilled' },
    { value: 'danger', label: 'Declined' },
];

/** The demands a staff member has raised, newest first, with where each one stands. */
export default function MyDemands({ user }) {
    const navigate = useNavigate();
    const [demands, setDemands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');
    const canCreate = Boolean(user?.eligibleForDemandCreation);

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${apiUrl}/demands/user`, { headers: authHeaders() });
            if (!response.ok) throw new Error('Could not load your demands.');
            setDemands(await response.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const counts = useMemo(() => {
        const tally = { warning: 0, success: 0, danger: 0 };
        demands.forEach((d) => {
            const tone = statusTone(d.hod_status === 'rejected' ? 'hod_rejected' : d.status);
            if (tally[tone] !== undefined) tally[tone] += 1;
        });
        return tally;
    }, [demands]);

    const visible = demands.filter((d) => {
        const tone = statusTone(d.hod_status === 'rejected' ? 'hod_rejected' : d.status);
        const text = `${d.id} ${d.description || ''} ${d.item_name || ''} ${(d.items || []).map((i) => i.item_name).join(' ')}`.toLowerCase();
        return (filter === 'all' || tone === filter) && text.includes(query.trim().toLowerCase());
    });

    return (
        <>
            <PageHeader
                title="My demands"
                actions={
                    <>
                        <Button variant="ghost" icon={<ArrowsClockwise size={16} />} onClick={load} aria-label="Refresh" />
                        {canCreate && (
                            <Button variant="primary" icon={<Plus size={16} weight="bold" />} onClick={() => navigate('/create-demand')}>
                                New demand
                            </Button>
                        )}
                    </>
                }
            />

            <div className="ui-stats stagger">
                <Stat label="All demands" value={demands.length} icon={<ClipboardText size={17} />} />
                <Stat label="In progress" value={counts.warning} tone="warning" icon={<Hourglass size={17} />} />
                <Stat label="Fulfilled" value={counts.success} tone="success" icon={<CheckCircle size={17} />} />
                <Stat label="Declined" value={counts.danger} tone="danger" icon={<XCircle size={17} />} />
            </div>

            {error && (
                <div className="md-gap">
                    <Notice tone="danger" actions={<Button size="sm" onClick={load}>Try again</Button>}>{error}</Notice>
                </div>
            )}

            <div className="md-toolbar">
                <Segmented label="Filter demands" value={filter} onChange={setFilter} options={FILTERS} />
                <label className="md-search">
                    <MagnifyingGlass size={16} />
                    <input type="search" placeholder="Search demands" value={query} onChange={(e) => setQuery(e.target.value)} />
                </label>
            </div>

            {loading ? (
                <LoadingBlock />
            ) : visible.length === 0 ? (
                <div className="ui-panel">
                    <EmptyState
                        icon={<ClipboardText size={26} />}
                        title={demands.length ? 'No demands match' : 'No demands yet'}
                        actions={canCreate && !demands.length && (
                            <Button variant="primary" icon={<Plus size={16} weight="bold" />} onClick={() => navigate('/create-demand')}>
                                New demand
                            </Button>
                        )}
                    />
                </div>
            ) : (
                <div className="md-list stagger">
                    {visible.map((demand) => (
                        <DemandCard key={demand.id} demand={demand} />
                    ))}
                </div>
            )}
        </>
    );
}

function DemandCard({ demand }) {
    const items = demand.items?.length ? demand.items : [{ id: 'single', item_name: demand.item_name, quantity: demand.quantity, unit: demand.unit || 'pcs', estimated_cost: demand.estimated_cost }];
    const rejectedByHod = demand.hod_status === 'rejected';

    return (
        <article className="md-card">
            <header className="md-card__head">
                <div>
                    <h2 className="md-card__title">Demand #{demand.id}</h2>
                    <p className="md-card__meta">
                        Raised {date(demand.created_at)} · needed by {date(demand.required_by)}
                    </p>
                </div>
                <div className="md-card__badges">
                    <UrgencyBadge urgency={demand.urgency} />
                    <StatusBadge status={rejectedByHod ? 'hod_rejected' : demand.status} />
                </div>
            </header>

            {demand.description && <p className="md-card__description">{demand.description}</p>}

            <div className="md-items">
                <div className="md-items__head">
                    <span>Item</span>
                    <span>Quantity</span>
                    <span className="md-right">Est. cost</span>
                </div>
                {items.map((item) => (
                    <div key={item.id} className="md-items__row">
                        <span className="md-items__name">
                            {item.item_name || '—'}
                            {item.store_status && <StatusBadge status={item.store_status} />}
                        </span>
                        <span className="numeric">
                            {item.quantity ?? '—'} {item.unit}
                            {item.store_available_quantity > 0 && <span className="md-muted"> · {item.store_available_quantity} in store</span>}
                        </span>
                        <span className="md-right numeric">{money(item.estimated_cost)}</span>
                    </div>
                ))}
                <div className="md-items__total">
                    <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                    <span className="md-right numeric">{money(demand.estimated_cost)}</span>
                </div>
            </div>

            {demand.hod_status && (
                <div className="md-response" data-tone={rejectedByHod ? 'danger' : 'success'}>
                    <strong>{rejectedByHod ? 'Declined by HOD' : 'Approved by HOD'}</strong>
                    {demand.hod_response_by_name && <span> · {demand.hod_response_by_name}</span>}
                    {demand.hod_response_at && <span className="md-muted"> · {date(demand.hod_response_at)}</span>}
                    {demand.hod_rejection_reason && <p>{demand.hod_rejection_reason}</p>}
                </div>
            )}

            {demand.store_response && (
                <div className="md-response">
                    <strong>Store</strong>
                    {demand.store_response_at && <span className="md-muted"> · {date(demand.store_response_at, true)}</span>}
                    <p>{demand.store_response}</p>
                </div>
            )}
        </article>
    );
}
