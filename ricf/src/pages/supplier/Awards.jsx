import { useCallback, useEffect, useState } from 'react';
import { ArrowsClockwise, DownloadSimple, Trophy } from '@phosphor-icons/react';
import { apiUrl, authHeaders } from '../../config/api';
import { Button, EmptyState, LoadingBlock, Notice, PageHeader } from '../../ui';
import { date, money, StatusBadge } from '../../ui/status';
import { toast } from '../../lib/notify';
import './awards.css';

/** Tenders this supplier has won, with their award letters. */
export default function Awards() {
    const [awards, setAwards] = useState([]);
    const [state, setState] = useState('loading'); // loading | ready | error
    const [downloading, setDownloading] = useState(null);

    const load = useCallback(async () => {
        setState('loading');
        try {
            const response = await fetch(`${apiUrl}/supplier-awards`, { headers: authHeaders() });
            if (!response.ok) throw new Error();
            setAwards(await response.json());
            setState('ready');
        } catch {
            setState('error');
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const downloadLetter = async (award) => {
        setDownloading(award.id);
        try {
            const response = await fetch(`${apiUrl}/supplier-awards/${award.id}/download`, { headers: authHeaders(false) });
            if (!response.ok) throw new Error();
            const url = URL.createObjectURL(await response.blob());
            const link = Object.assign(document.createElement('a'), { href: url, download: award.letter_original_name || `award-letter-${award.tender_number || award.tender_id}.pdf` });
            link.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Could not download the award letter');
        } finally {
            setDownloading(null);
        }
    };

    return (
        <>
            <PageHeader
                title="Awards"
                actions={<Button icon={<ArrowsClockwise size={16} />} onClick={load}>Refresh</Button>}
            />

            {state === 'loading' && <LoadingBlock />}

            {state === 'error' && (
                <Notice tone="danger" actions={<Button size="sm" onClick={load}>Try again</Button>}>
                    Could not load awards.
                </Notice>
            )}

            {state === 'ready' && awards.length === 0 && (
                <div className="ui-panel">
                    <EmptyState icon={<Trophy size={26} />} title="No awards yet" />
                </div>
            )}

            {state === 'ready' && awards.length > 0 && (
                <div className="awards stagger">
                    {awards.map((award) => (
                        <article key={award.id} className="award">
                            <div className="award__icon">
                                <Trophy size={22} weight="fill" />
                            </div>
                            <div className="award__body">
                                <div className="award__head">
                                    <h2 className="award__title">{award.tender_title || `Tender #${award.tender_id}`}</h2>
                                    <StatusBadge status={award.award_status || 'awarded'} />
                                </div>
                                <p className="award__meta">
                                    {award.tender_number ? `Tender ${award.tender_number}` : `Tender #${award.tender_id}`} · awarded {date(award.awarded_at)}
                                    {award.awarded_items?.length > 0 && ` · ${award.awarded_items.length} ${award.awarded_items.length === 1 ? 'item' : 'items'}`}
                                </p>
                                {award.tender_description && <p className="award__description">{award.tender_description}</p>}
                            </div>
                            <div className="award__side">
                                <span className="award__amount numeric">{money(award.award_amount)}</span>
                                {award.award_letter_id && (
                                    <Button size="sm" icon={<DownloadSimple size={15} />} loading={downloading === award.id} onClick={() => downloadLetter(award)}>
                                        Award letter
                                    </Button>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </>
    );
}
