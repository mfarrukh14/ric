import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './TechnicalEvaluationDashboard.css';

const TechnicalEvaluationDashboard = () => {
    const [activeTab, setActiveTab] = useState('current');
    const [currentTenders, setCurrentTenders] = useState([]);
    const [archivedEvaluations, setArchivedEvaluations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [downloadingReports, setDownloadingReports] = useState({});
    const navigate = useNavigate();
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    useEffect(() => {
        if (activeTab === 'current') {
            fetchCurrentEvaluations();
        } else if (activeTab === 'archived') {
            fetchArchivedEvaluations();
        }
    }, [activeTab]);

    const fetchCurrentEvaluations = async () => {
        setLoading(true);
        setError('');
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/api/technical-evaluation/expired-tenders`, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch current evaluations');
            }
            
            const data = await response.json();
            setCurrentTenders(data);
        } catch (error) {
            setError('Failed to fetch current evaluations');
            console.error('Error fetching current evaluations:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchArchivedEvaluations = async () => {
        setLoading(true);
        setError('');
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/api/technical-reports/archived`, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch archived evaluations');
            }
            
            const data = await response.json();
            console.log('Archived evaluations data:', data);
            setArchivedEvaluations(data);
        } catch (error) {
            setError('Failed to fetch archived evaluations');
            console.error('Error fetching archived evaluations:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEvaluateClick = (tenderId) => {
        navigate(`/technical-evaluation/${tenderId}`);
    };

    const downloadReport = async (tenderId, supplierName, reportType) => {
        const downloadKey = `${tenderId}_${supplierName}_${reportType}`;
        setDownloadingReports(prev => ({ ...prev, [downloadKey]: true }));

        try {
            const token = localStorage.getItem('token');
            const endpoint = reportType === 'excel' ? 'comparative-analysis' : 'technical-evaluation';
            
            const response = await fetch(`${apiUrl}/api/technical-reports/tender/${tenderId}/supplier/${encodeURIComponent(supplierName)}/${endpoint}`, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to download ${reportType} report`);
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            
            const fileExtension = reportType === 'excel' ? 'xlsx' : 'docx';
            const fileName = `${reportType}_report_${supplierName}_tender_${tenderId}.${fileExtension}`;
            a.download = fileName;
            
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (error) {
            console.error('Download error:', error);
            setError(`Error downloading ${reportType} report: ${error.message}`);
        } finally {
            setDownloadingReports(prev => ({ ...prev, [downloadKey]: false }));
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    return (
        <div className="dashboard-container">
            {/* Header */}
            <div className="dashboard-header">
                <h1>Technical Evaluation Committee Dashboard</h1>
                <p style={{ color: '#6b7280', marginTop: '8px' }}>
                    Manage technical evaluations and generate reports
                </p>
            </div>

            {/* Tab Navigation */}
            <div className="tab-navigation">
                <button
                    onClick={() => setActiveTab('current')}
                    className={`tab-btn ${activeTab === 'current' ? 'active' : ''}`}
                >
                    Current Evaluations
                </button>
                <button
                    onClick={() => setActiveTab('archived')}
                    className={`tab-btn ${activeTab === 'archived' ? 'active' : ''}`}
                >
                    Archive & Reports
                </button>
            </div>

            <div className="dashboard-content">
                {error && (
                    <div className="error">
                        {error}
                    </div>
                )}

                {/* Current Evaluations Tab */}
                {activeTab === 'current' && (
                    <div>
                        {loading && (
                            <div className="loading">
                                Loading current evaluations...
                            </div>
                        )}

                        {!loading && currentTenders.length === 0 && (
                            <div className="no-data">
                                <p>No current evaluations available</p>
                            </div>
                        )}

                        {!loading && currentTenders.length > 0 && (
                            <div className="evaluations-grid">
                                {currentTenders.map((tender) => (
                                    <div key={tender.id} className="evaluation-card">
                                        <div className="evaluation-header">
                                            <h3>Tender #{tender.id}</h3>
                                            <span className={`status-badge ${tender.tender_status || 'active'}`}>
                                                {tender.tender_status || 'active'}
                                            </span>
                                        </div>
                                        <div className="evaluation-details">
                                            <p><strong>Item:</strong> {tender.item_name || 'N/A'}</p>
                                            <p><strong>Description:</strong> {tender.description || 'N/A'}</p>
                                            <p><strong>Bidding End:</strong> {tender.bidding_end_time ? formatDate(tender.bidding_end_time) : 'N/A'}</p>
                                            {tender.suppliers_count && (
                                                <p><strong>Suppliers Applied:</strong> {tender.suppliers_count}</p>
                                            )}
                                        </div>
                                        <div className="evaluation-actions">
                                            <button
                                                onClick={() => handleEvaluateClick(tender.id)}
                                                className="btn-primary"
                                            >
                                                Start Evaluation
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Archive Tab */}
                {activeTab === 'archived' && (
                    <div className="archived-evaluations">
                        {loading && (
                            <div className="loading">
                                Loading archived evaluations...
                            </div>
                        )}

                        {!loading && archivedEvaluations.length === 0 && (
                            <div className="no-data">
                                <p>No archived evaluations found</p>
                            </div>
                        )}

                        {!loading && archivedEvaluations.length > 0 && (
                            <div>
                                {archivedEvaluations.map((tender) => (
                                    <div key={tender.tender_id} className="archived-tender-card">
                                        <div className="tender-header">
                                            <h3>Tender #{tender.tender_id} - {tender.item_name}</h3>
                                            <div className="tender-meta">
                                                <span>Created: {formatDate(tender.created_at)}</span>
                                                <span>Suppliers: {tender.supplier_count}</span>
                                                {tender.avg_score && <span>Avg Score: {tender.avg_score.toFixed(2)}</span>}
                                            </div>
                                        </div>
                                        
                                        <div className="tender-description">
                                            <p><strong>Description:</strong> {tender.description || 'No description available'}</p>
                                        </div>
                                        
                                        <div className="suppliers-reports">
                                            <h4>Download Reports by Supplier:</h4>
                                            {tender.suppliers && tender.suppliers.length > 0 ? (
                                                <div className="suppliers-list">
                                                    {tender.suppliers.map((supplier) => (
                                                        <div key={supplier.id} className="supplier-item" style={{ 
                                                            border: '1px solid #e2e8f0', 
                                                            borderRadius: '8px', 
                                                            padding: '16px', 
                                                            marginBottom: '12px',
                                                            backgroundColor: '#f8fafc'
                                                        }}>
                                                            <div style={{ marginBottom: '12px' }}>
                                                                <h5 style={{ margin: '0 0 4px 0', color: '#1e293b' }}>{supplier.displayName}</h5>
                                                                <p style={{ margin: '0', color: '#64748b', fontSize: '14px' }}>
                                                                    Username: {supplier.username} | Status: {supplier.evaluation_status}
                                                                </p>
                                                            </div>
                                                            
                                                            <div className="supplier-actions" style={{ display: 'flex', gap: '8px' }}>
                                                                <button
                                                                    onClick={() => downloadReport(tender.tender_id, supplier.username, 'excel')}
                                                                    className="download-btn excel-btn"
                                                                    disabled={downloadingReports[`${tender.tender_id}_${supplier.username}_excel`]}
                                                                    style={{
                                                                        backgroundColor: '#059669',
                                                                        color: 'white',
                                                                        border: 'none',
                                                                        padding: '8px 12px',
                                                                        borderRadius: '6px',
                                                                        fontSize: '14px',
                                                                        cursor: 'pointer',
                                                                        opacity: downloadingReports[`${tender.tender_id}_${supplier.username}_excel`] ? 0.6 : 1
                                                                    }}
                                                                >
                                                                    {downloadingReports[`${tender.tender_id}_${supplier.username}_excel`] ? 
                                                                        '⏳ Downloading...' : '📊 Excel Report'
                                                                    }
                                                                </button>
                                                                
                                                                <button
                                                                    onClick={() => downloadReport(tender.tender_id, supplier.username, 'docx')}
                                                                    className="download-btn docx-btn"
                                                                    disabled={downloadingReports[`${tender.tender_id}_${supplier.username}_docx`]}
                                                                    style={{
                                                                        backgroundColor: '#2563eb',
                                                                        color: 'white',
                                                                        border: 'none',
                                                                        padding: '8px 12px',
                                                                        borderRadius: '6px',
                                                                        fontSize: '14px',
                                                                        cursor: 'pointer',
                                                                        opacity: downloadingReports[`${tender.tender_id}_${supplier.username}_docx`] ? 0.6 : 1
                                                                    }}
                                                                >
                                                                    {downloadingReports[`${tender.tender_id}_${supplier.username}_docx`] ? 
                                                                        '⏳ Downloading...' : '📄 DOCX Report'
                                                                    }
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ padding: '16px', backgroundColor: '#fef3c7', borderRadius: '8px', marginTop: '12px' }}>
                                                    <p style={{ margin: '0', color: '#92400e' }}>
                                                        No suppliers found for this tender. This may indicate an issue with the evaluation data.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TechnicalEvaluationDashboard;
