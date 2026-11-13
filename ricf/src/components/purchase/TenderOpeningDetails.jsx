import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeft, ArrowRight, DownloadSimple, Tray } from '@phosphor-icons/react';
import api from '../../config/api';
import { formatDate, formatDateTime } from '../../lib/time';
import { Button, EmptyState, LoadingBlock, Notice, PageHeader, Panel } from '../../ui';
import { TenderProgress, TenderStatus } from '../../ui/tender';
const TenderOpeningDetails = () => {
    const { tenderId } = useParams();
    const navigate = useNavigate();
    const [tender, setTender] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');

    // Helper function to get tender display name
    const getTenderDisplayName = (tender) => {
        if (tender?.tender_number) {
            return `Tender ${tender.tender_number}`;
        }
        return `Tender #${tender?.id}`;
    };

    useEffect(() => {
        fetchTenderDetails();
    }, [tenderId]);

    const fetchTenderDetails = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/demands/tenders/pending-opening/${tenderId}`);
            setTender(response.data);
        } catch (error) {
            console.error('Error fetching tender details:', error);
            setError('Failed to load tender details');
            toast.error('Failed to load tender details');
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadReport = async () => {
        try {
            setProcessing(true);
            const response = await api.get(`/demands/tenders/${tenderId}/opening-report`, {
                responseType: 'blob'
            });
            
            // Create blob link to download
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            
            const tenderName = getTenderDisplayName(tender);
            link.setAttribute('download', `${tenderName}_Opening_Report.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('Error downloading report:', error);
            toast.error('Failed to download report');
        } finally {
            setProcessing(false);
        }
    };

    const handleDownloadTechnicalBid = async (bidId, companyName) => {
        try {
            const response = await api.get(`/technical-evaluation/bids/${bidId}/technical-document`, {
                responseType: 'blob'
            });
            
            // Create blob link to download
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Technical_Bid_${companyName}_${bidId}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('Error downloading technical bid:', error);
            toast.error('Failed to download technical bid');
        }
    };

    const handleDownloadBidCdr = async (bidId, companyName) => {
        try {
            const response = await api.get(`/financial-opening/bids/${bidId}/bid-cdr-document`, {
                responseType: 'blob'
            });
            
            // Create blob link to download
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Bid_CDR_${companyName}_${bidId}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('Error downloading bid CDR document:', error);
            toast.error('Failed to download bid CDR document');
        }
    };

    const handleForwardToTechnicalEvaluation = async () => {
        try {
            setProcessing(true);
            await api.post(`/demands/tenders/${tenderId}/open`);
            
            toast.success('Tender forwarded to technical evaluation committee');
            
            // Navigate back to purchase dashboard
            navigate('/purchase/tender-opening');
        } catch (error) {
            console.error('Error forwarding tender:', error);
            toast.error('Failed to forward tender to technical evaluation');
        } finally {
            setProcessing(false);
        }
    };

    const getDeliveryTimeStats = () => {
        if (!tender?.bids || tender.bids.length === 0) return null;
        
        const deliveryTimes = tender.bids.map(bid => bid.delivery_days).filter(days => days != null);
        if (deliveryTimes.length === 0) return null;
        
        const min = Math.min(...deliveryTimes);
        const max = Math.max(...deliveryTimes);
        const avg = Math.round(deliveryTimes.reduce((sum, days) => sum + days, 0) / deliveryTimes.length);
        
        return { min, max, avg };
    };

    const back = () => navigate('/purchase/tender-opening');

    if (loading) return <LoadingBlock />;

    if (error || !tender) {
        return (
            <div className="opening">
                <PageHeader title="Tender opening" actions={<Button icon={<ArrowLeft size={16} />} onClick={back}>Back</Button>} />
                <Notice tone="danger">This tender is not waiting to be opened.</Notice>
            </div>
        );
    }

    const delivery = getDeliveryTimeStats();
    const totalBids = tender.bids?.length || 0;

    return (
        <div className="opening">
            <PageHeader
                title={tender.tender_number || `Tender #${tender.id}`}
                actions={(
                    <>
                        <Button icon={<ArrowLeft size={16} />} onClick={back}>Back</Button>
                        <Button icon={<DownloadSimple size={16} />} onClick={handleDownloadReport} disabled={processing}>Opening report</Button>
                        <Button variant="primary" icon={<ArrowRight size={16} />} onClick={handleForwardToTechnicalEvaluation} loading={processing} disabled={totalBids === 0}>
                            Forward to technical evaluation
                        </Button>
                    </>
                )}
            />

            <Panel>
                <div className="opening__status">
                    <TenderStatus status={tender.tender_status || 'pending_opening'} />
                    <TenderProgress status={tender.tender_status || 'pending_opening'} className="opening__progress" />
                </div>
                <dl className="opening__facts">
                    <div><dt>Item</dt><dd>{tender.item_name}</dd></div>
                    <div><dt>Requested by</dt><dd>{[tender.created_by_name, tender.creator_department].filter(Boolean).join(', ') || '—'}</dd></div>
                    <div><dt>Bidding closed</dt><dd>{formatDateTime(tender.bidding_end_time)}</dd></div>
                    <div><dt>Required by</dt><dd>{formatDate(tender.required_by)}</dd></div>
                    <div><dt>Bids received</dt><dd>{totalBids}</dd></div>
                    <div><dt>Delivery offered</dt><dd>{delivery ? (delivery.min === delivery.max ? `${delivery.min} days` : `${delivery.min}–${delivery.max} days (avg ${delivery.avg})`) : '—'}</dd></div>
                    {tender.description && <div className="opening__wide"><dt>Description</dt><dd>{tender.description}</dd></div>}
                </dl>
            </Panel>

            <Panel title="Bids" flush>
                {totalBids === 0 ? (
                    <EmptyState icon={<Tray size={26} />} title="No bids received" />
                ) : (
                    <div className="opening__table">
                        <table className="ui-table">
                            <thead>
                                <tr>
                                    <th>Company</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Delivery</th>
                                    <th>Submitted</th>
                                    <th><span className="visually-hidden">Documents</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {tender.bids.map((bid) => (
                                    <tr key={bid.id}>
                                        <td className="admin-table__name">{bid.company_name || '—'}</td>
                                        <td>{bid.company_email || '—'}</td>
                                        <td className="whitespace-nowrap">{bid.contact_phone || '—'}</td>
                                        <td className="whitespace-nowrap">{bid.delivery_days ? `${bid.delivery_days} days` : '—'}</td>
                                        <td className="whitespace-nowrap">{formatDateTime(bid.created_at)}</td>
                                        <td className="opening__docs">
                                            <Button size="sm" variant="ghost" icon={<DownloadSimple size={15} />} onClick={() => handleDownloadTechnicalBid(bid.id, bid.company_name || 'bid')}>Technical bid</Button>
                                            <Button size="sm" variant="ghost" icon={<DownloadSimple size={15} />} onClick={() => handleDownloadBidCdr(bid.id, bid.company_name || 'bid')}>Bid CDR</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>
            <p className="ui-hint">Bid amounts stay sealed until the financial opening.</p>
        </div>
    );
};

export default TenderOpeningDetails;
