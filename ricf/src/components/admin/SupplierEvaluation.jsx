import React, { useState, useEffect, useCallback } from 'react';
import { apiUrl } from '../../config/api';

// ChecklistItem component moved outside to prevent recreation on every render
const ChecklistItem = ({ criteriaKey, title, description, checklist, setChecklist }) => {
    const handleCheckboxChange = useCallback((checked) => {
        setChecklist(prev => ({
            ...prev,
            [criteriaKey]: {
                ...prev[criteriaKey],
                checked: checked
            }
        }));
    }, [criteriaKey, setChecklist]);

    const handleCommentsChange = useCallback((comments) => {
        setChecklist(prev => ({
            ...prev,
            [criteriaKey]: {
                ...prev[criteriaKey],
                comments: comments
            }
        }));
    }, [criteriaKey, setChecklist]);

    return (
        <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
            <div className="flex items-start space-x-3">
                <input
                    type="checkbox"
                    checked={checklist[criteriaKey]?.checked || false}
                    onChange={(e) => handleCheckboxChange(e.target.checked)}
                    className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500 mt-1"
                />
                <div className="flex-1">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-gray-900">{title}</h4>
                        {checklist[criteriaKey]?.checked && <span className="text-green-600">✓</span>}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{description}</p>
                    {!checklist[criteriaKey]?.checked && (
                        <textarea
                            placeholder="Add comments about issues..."
                            value={checklist[criteriaKey]?.comments || ''}
                            onChange={(e) => handleCommentsChange(e.target.value)}
                            className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            rows={2}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

const SupplierEvaluation = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [supplierDetails, setSupplierDetails] = useState(null);
    const [loading, setLoading] = useState(false);
    const [evaluating, setEvaluating] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [checklist, setChecklist] = useState({
        businessProfileComplete: { checked: false, comments: '' },
        documentsSubmitted: { checked: false, comments: '' },
        businessLicenseValid: { checked: false, comments: '' },
        taxCertificateValid: { checked: false, comments: '' },
        qualificationMet: { checked: false, comments: '' },
        experienceAdequate: { checked: false, comments: '' },
        pastExperienceValid: { checked: false, comments: '' },
        workProofAuthentic: { checked: false, comments: '' },
        financialStability: { checked: false, comments: '' },
        complianceRecords: { checked: false, comments: '' }
    });
    const [error, setError] = useState('');
    const [showResubmitModal, setShowResubmitModal] = useState(false);
    const [resubmitMessage, setResubmitMessage] = useState('');

    useEffect(() => {
        fetchPendingSuppliers();
    }, []);

    const allChecklistApproved = Object.values(checklist).every(item => item.checked);

    const evaluationSteps = [
        {
            title: 'Basic Information',
            icon: '🏢',
            criteria: ['businessProfileComplete'],
            component: 'BasicInfo'
        },
        {
            title: 'Documents Verification',
            icon: '📄',
            criteria: ['documentsSubmitted', 'businessLicenseValid', 'taxCertificateValid'],
            component: 'Documents'
        },
        {
            title: 'Qualifications & Experience',
            icon: '🎓',
            criteria: ['qualificationMet', 'experienceAdequate'],
            component: 'Qualifications'
        },
        {
            title: 'Past Experience Record',
            icon: '🏗️',
            criteria: ['pastExperienceValid', 'workProofAuthentic'],
            component: 'PastExperience'
        },
        {
            title: 'Financial & Compliance',
            icon: '💰',
            criteria: ['financialStability', 'complianceRecords'],
            component: 'Financial'
        }
    ];

    const criteriaDetails = {
        businessProfileComplete: { title: 'Business Profile Complete', desc: 'All business information fields are properly filled and accurate' },
        documentsSubmitted: { title: 'Required Documents Submitted', desc: 'All mandatory documents are uploaded and accessible' },
        businessLicenseValid: { title: 'Valid Business License', desc: 'Business license is current, valid, and matches business information' },
        taxCertificateValid: { title: 'Tax Certificate Valid', desc: 'Tax registration certificate is valid and up-to-date' },
        qualificationMet: { title: 'Qualification Requirements Met', desc: 'Supplier meets minimum qualification requirements for their category' },
        experienceAdequate: { title: 'Adequate Experience', desc: 'Supplier has sufficient experience in their business domain' },
        pastExperienceValid: { title: 'Past Experience Records Valid', desc: 'Previous work history and client references are verified and authentic' },
        workProofAuthentic: { title: 'Work Proof Images Authentic', desc: 'Uploaded images and proof of past work are genuine and verifiable' },
        financialStability: { title: 'Financial Stability', desc: 'Supplier demonstrates financial stability and capability' },
        complianceRecords: { title: 'Compliance Records', desc: 'No adverse compliance or legal issues identified' }
    };

    // Reusable Components
    const StatusBadge = ({ status, children }) => {
        const colors = {
            verified: 'bg-green-100 text-green-800',
            pending: 'bg-yellow-100 text-yellow-800',
            rejected: 'bg-red-100 text-red-800',
            approved: 'bg-green-100 text-green-800'
        };
        return <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>{children}</span>;
    };

    const InfoField = ({ label, value, className = '' }) => (
        <div className={`text-sm ${className}`}>
            <span className="font-medium text-gray-600">{label}:</span>
            <span className="ml-2 text-gray-900">{value}</span>
        </div>
    );

    const fetchPendingSuppliers = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/suppliers/pending`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            setSuppliers(response.ok ? (data.suppliers || data || []) : []);
            if (!response.ok) setError(data.error || 'Failed to fetch suppliers');
        } catch (error) {
            console.error('Error fetching suppliers:', error);
            setError('Failed to fetch suppliers');
            setSuppliers([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchSupplierDetails = async (supplierId) => {
        try {
            setLoading(true);
            setSelectedSupplier(supplierId);
            setCurrentStep(0);
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/suppliers/${supplierId}/comprehensive`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            console.log('Supplier details received:', data);
            console.log('Past experience data:', data.pastExperience);
            console.log('Client references data:', data.clientReferences);
            console.log('Work proof images data:', data.workProofImages);
            setSupplierDetails(response.ok ? data : null);
            setChecklist({
                businessProfileComplete: { checked: false, comments: '' },
                documentsSubmitted: { checked: false, comments: '' },
                businessLicenseValid: { checked: false, comments: '' },
                taxCertificateValid: { checked: false, comments: '' },
                qualificationMet: { checked: false, comments: '' },
                experienceAdequate: { checked: false, comments: '' },
                pastExperienceValid: { checked: false, comments: '' },
                workProofAuthentic: { checked: false, comments: '' },
                financialStability: { checked: false, comments: '' },
                complianceRecords: { checked: false, comments: '' }
            });
        } catch (error) {
            console.error('Error fetching supplier details:', error);
            setSupplierDetails(null);
        } finally {
            setLoading(false);
        }
    };

    const apiRequest = async (endpoint, body = null, method = 'POST') => {
        const token = localStorage.getItem('token');
        const response = await fetch(`${apiUrl}${endpoint}`, {
            method,
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            ...(body && { body: JSON.stringify(body) })
        });
        return { response, data: await response.json() };
    };

    const handleApprove = async () => {
        if (!allChecklistApproved) {
            setError('All evaluation criteria must be satisfied before approval');
            return;
        }
        try {
            setEvaluating(true);
            const { response } = await apiRequest(`/suppliers/${selectedSupplier}/evaluate`, {
                action: 'approve',
                comments: 'All evaluation criteria met successfully',
                checklist
            });
            if (response.ok) {
                alert('Supplier approved successfully!');
                setChecklist({
                    businessProfileComplete: { checked: false, comments: '' },
                    documentsSubmitted: { checked: false, comments: '' },
                    businessLicenseValid: { checked: false, comments: '' },
                    taxCertificateValid: { checked: false, comments: '' },
                    qualificationMet: { checked: false, comments: '' },
                    experienceAdequate: { checked: false, comments: '' },
                    pastExperienceValid: { checked: false, comments: '' },
                    workProofAuthentic: { checked: false, comments: '' },
                    financialStability: { checked: false, comments: '' },
                    complianceRecords: { checked: false, comments: '' }
                });
                // Remove the approved supplier from the pending list
                setSuppliers(prev => prev.filter(supplier => supplier.id !== selectedSupplier));
                setSelectedSupplier(null);
                setSupplierDetails(null);
                setCurrentStep(0);
            }
        } catch (error) {
            setError('Failed to approve supplier');
        } finally {
            setEvaluating(false);
        }
    };

    const handleResubmitRequest = async () => {
        if (!selectedSupplier) return;
        
        // Check if all unchecked items have comments
        const uncheckedItemsWithoutComments = Object.keys(criteriaDetails)
            .filter(key => !checklist[key]?.checked && (!checklist[key]?.comments || checklist[key]?.comments.trim() === ''));
        
        if (uncheckedItemsWithoutComments.length > 0) {
            setError('Please provide comments for all unchecked items before requesting resubmission.');
            return;
        }
        
        try {
            setEvaluating(true);
            const issues = Object.keys(criteriaDetails)
                .filter(key => !checklist[key]?.checked && checklist[key]?.comments)
                .map(key => ({
                    title: criteriaDetails[key].title,
                    description: criteriaDetails[key].desc,
                    comments: checklist[key].comments
                }));

            const failedCriteria = Object.keys(criteriaDetails)
                .filter(key => !checklist[key]?.checked && checklist[key]?.comments)
                .map(key => ({
                    criteriaName: criteriaDetails[key].title,
                    status: "failed",
                    evaluatorComment: checklist[key].comments
                }));

            const { response } = await apiRequest(`/suppliers/${selectedSupplier}/request-resubmit`, {
                issues,
                failedCriteria,
                additionalMessage: resubmitMessage
            });

            if (response.ok) {
                alert('Resubmission request sent successfully!');
                setShowResubmitModal(false);
                setResubmitMessage('');
                setError(''); // Clear any previous errors
                // Remove the supplier from pending list as they need to resubmit
                setSuppliers(prev => prev.filter(supplier => supplier.id !== selectedSupplier));
                setSelectedSupplier(null);
                setSupplierDetails(null);
                setCurrentStep(0);
            }
        } catch (error) {
            alert('Error sending resubmission request');
        } finally {
            setEvaluating(false);
        }
    };

    const downloadDocument = async (documentType) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/suppliers/${selectedSupplier}/document/${documentType}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${documentType}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (error) {
            setError('Failed to download document');
        }
    };

    // Step Components
    const BasicInfoStep = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900">Company Details</h3>
                    <InfoField label="Company Name" value={supplierDetails.supplier?.company_name || supplierDetails.businessProfile?.business_name} />
                    <InfoField label="Legal Structure" value={supplierDetails.businessProfile?.legal_structure} />
                    <InfoField label="Category" value={supplierDetails.businessProfile?.business_category} />
                    <InfoField label="Tax ID" value={supplierDetails.businessProfile?.business_tax_id} />
                    <InfoField label="Registration Number" value={supplierDetails.businessProfile?.business_registration_number} />
                </div>
                <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900">Status & Verification</h3>
                    <div className="text-sm">
                        <span className="font-medium text-gray-600">Email Verified:</span>
                        <StatusBadge status={supplierDetails.supplier?.email_verified ? 'verified' : 'pending'}>
                            {supplierDetails.supplier?.email_verified ? 'Verified' : 'Not Verified'}
                        </StatusBadge>
                    </div>
                    <InfoField label="Registration Step" value={`${supplierDetails.supplier?.registration_step}/6`} />
                    <InfoField label="Origin" value={supplierDetails.businessProfile?.origin_classification} />
                    <InfoField label="Country" value={supplierDetails.businessProfile?.country_of_origin} />
                </div>
            </div>
            <div className="mt-6">
                <ChecklistItem 
                    criteriaKey="businessProfileComplete" 
                    title={criteriaDetails.businessProfileComplete.title} 
                    description={criteriaDetails.businessProfileComplete.desc}
                    checklist={checklist}
                    setChecklist={setChecklist}
                />
            </div>
        </div>
    );

    const getDocumentDisplayName = (docType) => {
        const documentNames = {
            'ntnDocument': 'NTN Certificate',
            'gstDocument': 'GST Registration',
            'pecDocument': 'PEC Certificate',
            'professionalTaxCert': 'Professional Tax Certificate',
            'drugSaleLicense': 'Drug Sale License',
            'businessLicense': 'Business License',
            'taxCertificate': 'Tax Certificate',
            'incorporationCertificate': 'Certificate of Incorporation',
            'tradeLicense': 'Trade License',
            'bankStatement': 'Bank Statement',
            'auditedFinancials': 'Audited Financial Statements'
        };
        return documentNames[docType] || docType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    };

    const DocumentsStep = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {supplierDetails.documents?.map((doc, index) => (
                    <button
                        key={index}
                        onClick={() => downloadDocument(doc.document_type)}
                        className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
                    >
                        <div className="flex items-center space-x-3">
                            <span className="text-2xl">📄</span>
                            <div className="flex-1">
                                <div className="text-sm font-medium text-blue-600">{getDocumentDisplayName(doc.document_type)}</div>
                                <div className="text-xs text-gray-500 mt-1">{doc.document_name}</div>
                                <div className="text-xs text-gray-400">Click to download</div>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
            <div className="space-y-4">
                {['documentsSubmitted', 'businessLicenseValid', 'taxCertificateValid'].map(key => (
                    <ChecklistItem 
                        key={key} 
                        criteriaKey={key} 
                        title={criteriaDetails[key].title} 
                        description={criteriaDetails[key].desc}
                        checklist={checklist}
                        setChecklist={setChecklist}
                    />
                ))}
            </div>
        </div>
    );

    const QualificationsStep = () => (
        <div className="space-y-6">
            {supplierDetails.registrationBodies?.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Registration Bodies</h3>
                    <div className="grid gap-3">
                        {supplierDetails.registrationBodies.map((body, index) => (
                            <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                <InfoField label="Body" value={body.body_name} />
                                <InfoField label="Registration #" value={body.registration_number} />
                                <InfoField label="Valid Until" value={new Date(body.expiry_date).toLocaleDateString()} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="space-y-4">
                {['qualificationMet', 'experienceAdequate'].map(key => (
                    <ChecklistItem 
                        key={key} 
                        criteriaKey={key} 
                        title={criteriaDetails[key].title} 
                        description={criteriaDetails[key].desc}
                        checklist={checklist}
                        setChecklist={setChecklist}
                    />
                ))}
            </div>
        </div>
    );

    const PastExperienceStep = () => (
        <div className="space-y-6">
            {/* Past Work Experience Records */}
            {supplierDetails.pastExperience?.length > 0 ? (
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Past Work Experience</h3>
                    <div className="grid gap-4">
                        {supplierDetails.pastExperience.map((experience, index) => (
                            <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <InfoField label="Project/Work Title" value={experience.project_title || experience.projectTitle || 'Not specified'} />
                                        <InfoField label="Client/Organization" value={experience.client_name || experience.clientName || 'Not specified'} />
                                        <InfoField label="Duration" value={experience.duration || 'Not specified'} />
                                        <InfoField label="Project Value" value={experience.project_value || experience.projectValue || 'Not specified'} />
                                    </div>
                                    <div className="space-y-2">
                                        <InfoField label="Work Type" value={experience.work_type || experience.workType || experience.category || 'Not specified'} />
                                        <InfoField label="Start Date" value={experience.start_date || experience.startDate ? new Date(experience.start_date || experience.startDate).toLocaleDateString() : 'Not specified'} />
                                        <InfoField label="End Date" value={experience.end_date || experience.endDate ? new Date(experience.end_date || experience.endDate).toLocaleDateString() : 'Ongoing'} />
                                        <InfoField label="Status" value={experience.status || 'Completed'} />
                                    </div>
                                </div>
                                {experience.description && (
                                    <div className="mt-3">
                                        <InfoField label="Description" value={experience.description} className="text-sm" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <div className="text-gray-400 text-4xl mb-2">🏗️</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-1">No Past Experience Records</h3>
                    <p className="text-gray-500 text-sm">This supplier has not provided past work experience details</p>
                </div>
            )}

            {/* Work Proof Images */}
            {supplierDetails.workProofImages?.length > 0 ? (
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Work Proof Images</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {supplierDetails.workProofImages.map((image, index) => (
                            <div key={index} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                                <div className="aspect-square bg-gray-100 flex items-center justify-center">
                                    {image.image_url ? (
                                        <img 
                                            src={image.image_url} 
                                            alt={image.description || `Work proof ${index + 1}`}
                                            className="w-full h-full object-cover cursor-pointer"
                                            onClick={() => window.open(image.image_url, '_blank')}
                                        />
                                    ) : (
                                        <div className="text-gray-400 text-center p-4">
                                            <span className="text-2xl mb-2 block">🖼️</span>
                                            <span className="text-xs">Image not available</span>
                                        </div>
                                    )}
                                </div>
                                <div className="p-2">
                                    <p className="text-xs text-gray-600 line-clamp-2">{image.description || 'Work proof image'}</p>
                                    {image.project_reference && (
                                        <p className="text-xs text-blue-600 mt-1">Ref: {image.project_reference}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <div className="text-gray-400 text-4xl mb-2">🖼️</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-1">No Work Proof Images</h3>
                    <p className="text-gray-500 text-sm">This supplier has not uploaded work proof images</p>
                </div>
            )}

            {/* Client References */}
            {supplierDetails.clientReferences?.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Client References</h3>
                    <div className="grid gap-3">
                        {supplierDetails.clientReferences.map((reference, index) => (
                            <div key={index} className="border border-gray-200 rounded-lg p-3 bg-blue-50">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <InfoField label="Reference Name" value={reference.contact_name || reference.contactName || 'Not specified'} />
                                    <InfoField label="Organization" value={reference.organization || 'Not specified'} />
                                    <InfoField label="Position" value={reference.position || 'Not specified'} />
                                    <InfoField label="Contact" value={reference.phone || reference.email || 'Not specified'} />
                                </div>
                                {reference.relationship && (
                                    <div className="mt-2">
                                        <InfoField label="Relationship" value={reference.relationship} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Evaluation Checklist */}
            <div className="space-y-4">
                {['pastExperienceValid', 'workProofAuthentic'].map(key => (
                    <ChecklistItem 
                        key={key} 
                        criteriaKey={key} 
                        title={criteriaDetails[key].title} 
                        description={criteriaDetails[key].desc}
                        checklist={checklist}
                        setChecklist={setChecklist}
                    />
                ))}
            </div>
        </div>
    );

    const FinancialStep = () => (
        <div className="space-y-6">
            {supplierDetails.ppraRegistrations?.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">PPRA Registrations</h3>
                    <div className="grid gap-3">
                        {supplierDetails.ppraRegistrations.map((ppra, index) => (
                            <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                <InfoField label="Category" value={ppra.registration_category} />
                                <InfoField label="Registration #" value={ppra.registration_number} />
                                <InfoField label="Valid Until" value={new Date(ppra.expiry_date).toLocaleDateString()} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="space-y-4">
                {['financialStability', 'complianceRecords'].map(key => (
                    <ChecklistItem 
                        key={key} 
                        criteriaKey={key} 
                        title={criteriaDetails[key].title} 
                        description={criteriaDetails[key].desc}
                        checklist={checklist}
                        setChecklist={setChecklist}
                    />
                ))}
            </div>
        </div>
    );

    const stepComponents = { BasicInfo: BasicInfoStep, Documents: DocumentsStep, Qualifications: QualificationsStep, PastExperience: PastExperienceStep, Financial: FinancialStep };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Supplier Evaluation Dashboard</h1>
                    <p className="text-gray-600 mt-2">Review and evaluate supplier applications step by step</p>
                </div>

                {error && (
                    <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
                        <div className="text-red-700">{error}</div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Suppliers Sidebar */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                            <div className="p-6 border-b border-gray-200">
                                <h2 className="text-lg font-semibold text-gray-900">Pending Applications</h2>
                                <p className="text-sm text-gray-500 mt-1">{suppliers.length} suppliers waiting</p>
                            </div>
                            <div className="p-4 max-h-96 overflow-y-auto">
                                {loading ? (
                                    <div className="flex justify-center py-8">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    </div>
                                ) : suppliers.length > 0 ? (
                                    <div className="space-y-3">
                                        {suppliers.map((supplier) => (
                                            <div
                                                key={supplier.id}
                                                onClick={() => fetchSupplierDetails(supplier.id)}
                                                className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                                                    selectedSupplier === supplier.id ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200'
                                                }`}
                                            >
                                                <h3 className="font-medium text-gray-900 text-sm">{supplier.company_name}</h3>
                                                <p className="text-xs text-gray-600 mt-1">{supplier.company_email}</p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {new Date(supplier.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-gray-500">No pending suppliers</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Main Evaluation Area */}
                    <div className="lg:col-span-3">
                        {supplierDetails ? (
                            <div className="space-y-6">
                                {/* Header */}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-2xl font-bold text-gray-900">
                                                {supplierDetails.supplier?.company_name || supplierDetails.businessProfile?.business_name}
                                            </h2>
                                            <p className="text-gray-600">{supplierDetails.supplier?.company_email}</p>
                                        </div>
                                        <StatusBadge status="pending">Under Review</StatusBadge>
                                    </div>
                                </div>

                                {/* Progress Steps */}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <div className="flex items-center justify-between mb-6">
                                        {evaluationSteps.map((step, index) => (
                                            <div key={index} className="flex items-center">
                                                <button
                                                    onClick={() => setCurrentStep(index)}
                                                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                                                        currentStep === index 
                                                            ? 'bg-blue-100 text-blue-700 border-2 border-blue-300' 
                                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                    }`}
                                                >
                                                    <span className="text-xl">{step.icon}</span>
                                                    <span className="font-medium text-sm">{step.title}</span>
                                                    {step.criteria.every(c => checklist[c]?.checked) && (
                                                        <span className="text-green-600">✓</span>
                                                    )}
                                                </button>
                                                {index < evaluationSteps.length - 1 && (
                                                    <div className="h-0.5 w-8 bg-gray-300 mx-2"></div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Current Step Content */}
                                    <div className="min-h-96">
                                        <div className="mb-4">
                                            <h3 className="text-xl font-semibold text-gray-900 flex items-center space-x-2">
                                                <span>{evaluationSteps[currentStep].icon}</span>
                                                <span>{evaluationSteps[currentStep].title}</span>
                                            </h3>
                                        </div>
                                        {stepComponents[evaluationSteps[currentStep].component]()}
                                    </div>

                                    {/* Navigation & Actions */}
                                    <div className="flex items-center justify-between pt-6 border-t border-gray-200">
                                        <div className="flex space-x-3">
                                            <button
                                                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                                                disabled={currentStep === 0}
                                                className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                                            >
                                                ← Previous
                                            </button>
                                            <button
                                                onClick={() => setCurrentStep(Math.min(evaluationSteps.length - 1, currentStep + 1))}
                                                disabled={currentStep === evaluationSteps.length - 1}
                                                className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                                            >
                                                Next →
                                            </button>
                                        </div>

                                        <div className="flex space-x-3">
                                            {allChecklistApproved ? (
                                                <button
                                                    onClick={handleApprove}
                                                    disabled={evaluating}
                                                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                                                >
                                                    {evaluating ? 'Approving...' : '✓ Approve'}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        // Check if there are unchecked items without comments
                                                        const uncheckedItemsWithoutComments = Object.keys(criteriaDetails)
                                                            .filter(key => !checklist[key]?.checked && (!checklist[key]?.comments || checklist[key]?.comments.trim() === ''));
                                                        
                                                        if (uncheckedItemsWithoutComments.length > 0) {
                                                            setError('Please provide comments for all unchecked items before requesting changes.');
                                                            return;
                                                        }
                                                        
                                                        setError(''); // Clear any previous errors
                                                        setShowResubmitModal(true);
                                                    }}
                                                    disabled={evaluating}
                                                    className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 font-medium"
                                                >
                                                    📝 Request Changes
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Progress Summary */}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Evaluation Progress</h3>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm text-gray-600">Completion</span>
                                        <span className="text-sm font-medium text-gray-900">
                                            {Object.values(checklist).filter(item => item.checked).length} / {Object.keys(checklist).length}
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-3">
                                        <div 
                                            className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all duration-500" 
                                            style={{ width: `${(Object.values(checklist).filter(item => item.checked).length / Object.keys(checklist).length) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                                <div className="text-gray-400 text-6xl mb-4">📋</div>
                                <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Supplier</h3>
                                <p className="text-gray-500">Choose a supplier from the list to begin evaluation</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Resubmission Modal */}
                {showResubmitModal && (
                    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{backdropFilter: 'blur(8px)', background: 'rgba(255,255,255,0.2)'}}>
                        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                            <div className="px-6 py-4 border-b border-gray-200">
                                <h3 className="text-lg font-semibold text-gray-900">Request Resubmission</h3>
                            </div>
                            <div className="p-6">
                                <p className="text-sm text-gray-600 mb-4">Issues found that need to be addressed:</p>
                                <div className="space-y-3 mb-6">
                                    {Object.keys(criteriaDetails).map(key => {
                                        const item = checklist[key];
                                        if (!item?.checked) {
                                            const hasComments = item?.comments && item.comments.trim() !== '';
                                            return (
                                                <div key={key} className={`border rounded-lg p-3 ${hasComments ? 'border-red-200 bg-red-50' : 'border-orange-200 bg-orange-50'}`}>
                                                    <div className={`font-medium ${hasComments ? 'text-red-800' : 'text-orange-800'} flex items-center justify-between`}>
                                                        {criteriaDetails[key].title}
                                                        {!hasComments && <span className="text-xs bg-orange-200 text-orange-800 px-2 py-1 rounded">Comments Required</span>}
                                                    </div>
                                                    {hasComments ? (
                                                        <div className="text-sm text-red-600 mt-1">{item.comments}</div>
                                                    ) : (
                                                        <div className="text-sm text-orange-600 mt-1 italic">Please provide comments explaining the issue with this criteria.</div>
                                                    )}
                                                </div>
                                            );
                                        }
                                        return null;
                                    })}
                                </div>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Additional Message (Optional)</label>
                                    <textarea
                                        value={resubmitMessage}
                                        onChange={(e) => setResubmitMessage(e.target.value)}
                                        placeholder="Additional message to supplier..."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        rows={4}
                                    />
                                </div>
                                {/* Validation message */}
                                {Object.keys(criteriaDetails).some(key => !checklist[key]?.checked && (!checklist[key]?.comments || checklist[key]?.comments.trim() === '')) && (
                                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-yellow-600">⚠️</span>
                                            <span className="text-sm text-yellow-800 font-medium">
                                                Please go back and add comments to all unchecked criteria before submitting.
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                                <button
                                    onClick={() => setShowResubmitModal(false)}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleResubmitRequest}
                                    disabled={evaluating || Object.keys(criteriaDetails).some(key => !checklist[key]?.checked && (!checklist[key]?.comments || checklist[key]?.comments.trim() === ''))}
                                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {evaluating ? 'Sending...' : 'Send Request'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SupplierEvaluation;
