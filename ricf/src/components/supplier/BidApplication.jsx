import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiUrl } from '../../config/api';

const BidApplication = ({ tender: propTender, onCancel, onSuccess }) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [tender, setTender] = useState(propTender || null);
    const [fetchingTender, setFetchingTender] = useState(!propTender);
    const [knockoutChecklist, setKnockoutChecklist] = useState([]);
    const [acknowledging, setAcknowledging] = useState(false);
    const navigate = useNavigate();
    const { tenderId } = useParams();

    // Helper function to get tender display name
    const getTenderDisplayName = (tender) => {
        if (tender?.tender_number) {
            return `Tender ${tender.tender_number}`;
        }
        return `Tender #${tender?.id || 'Unknown'}`;
    };

    // Fetch tender data when component mounts (only if not provided as prop)
    useEffect(() => {
        if (propTender) {
            setTender(propTender);
            setFetchingTender(false);
            return;
        }

    const fetchTenderData = async () => {
            try {
                const token = localStorage.getItem('supplierToken');
                console.log('BidApplication - fetching tender data with token:', token ? 'present' : 'missing');
                const response = await fetch(`${apiUrl}/suppliers/tenders/active`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    console.error('BidApplication - Failed to fetch tender data:', response.status, response.statusText);
                    throw new Error('Failed to fetch tender data');
                }

                const data = await response.json();
                console.log('BidApplication - Tender data received:', data);
                const foundTender = data.find(t => t.id === parseInt(tenderId));
                
                if (!foundTender) {
                    console.error('BidApplication - Tender not found with ID:', tenderId, 'Available tenders:', data.map(t => t.id));
                    throw new Error('Tender not found');
                }

                console.log('BidApplication - Found tender:', foundTender);
                setTender(foundTender);
            } catch (err) {
                console.error('BidApplication - Error fetching tender:', err);
                setError(err.message);
            } finally {
                setFetchingTender(false);
            }
        };

        if (tenderId) {
            fetchTenderData();
        }
    }, [tenderId, propTender]);

    // Form data for all steps
    const [bidData, setBidData] = useState({
        items: [],
        technicalBid: null,
        financialBid: null,
        deliveryTime: '',
        comments: '',
        companyName: '',
        registeredNumber: '',
        agreeToTerms: false
    });

    // Fetch detailed tender (knockout clauses) once tender basic data is set
    useEffect(() => {
        const fetchDetails = async () => {
            if (!tender || tender.knockoutClauses) return; // already have details
            try {
                const token = localStorage.getItem('supplierToken');
                const resp = await fetch(`${apiUrl}/demands/tenders/${tender.id}/details`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resp.ok) {
                    const data = await resp.json();
                    const detailedTender = { ...tender, ...data.tender };
                    setTender(detailedTender);
                    if (data.tender.knockoutClauses) {
                        if (data.tender.supplier_knockout_ack?.checklist) {
                            setKnockoutChecklist(data.tender.knockoutClauses.map(c => {
                                const found = data.tender.supplier_knockout_ack.checklist.find(p => p.id === c.id);
                                return { id: c.id, checked: found ? !!found.checked : false, title: c.criteria_title };
                            }));
                        } else {
                            setKnockoutChecklist(data.tender.knockoutClauses.map(c => ({ id: c.id, checked: false, title: c.criteria_title })));
                        }
                    }
                }
            } catch (e) {
                console.error('Failed to fetch tender details for knockout clauses', e);
            }
        };
        fetchDetails();
    }, [tender]);

    // Update bidData when tender is loaded (only if items not already initialized)
    useEffect(() => {
        if (tender?.items && bidData.items.length === 0) {
            setBidData(prev => ({
                ...prev,
                items: tender.items.map(item => ({
                    id: item.id,
                    item_name: item.item_name,
                    required_quantity: item.quantity,
                    unit: item.unit || 'pieces',
                    will_provide: true, // true = provide full quantity, false = drop item
                    total_cost: '',
                    price_per_unit: '',
                    manufacturer_brand: '',
                    remarks: item.remarks || ''
                }))
            }));
        }
    }, [tender, bidData.items.length]);

    // Handle cancel - navigate back to supplier dashboard if no onCancel prop
    const handleCancel = () => {
        if (onCancel) {
            onCancel();
        } else {
            navigate('/supplier-dashboard');
        }
    };

    // Handle success - navigate back to supplier dashboard if no onSuccess prop
    const handleSuccess = () => {
        if (onSuccess) {
            onSuccess();
        } else {
            navigate('/supplier-dashboard');
        }
    };

    // Show loading state while fetching tender
    if (fetchingTender) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading tender details...</p>
                </div>
            </div>
        );
    }

    // Show error if tender not found or failed to load
    if (error && !tender) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
                        <h2 className="text-lg font-medium text-red-800 mb-2">Error Loading Tender</h2>
                        <p className="text-red-700 mb-4">{error}</p>
                        <button
                            onClick={() => navigate('/supplier-dashboard')}
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                        >
                            Return to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const handleItemChange = (index, field, value) => {
        setBidData(prev => ({
            ...prev,
            items: prev.items.map((item, i) => {
                if (i === index) {
                    const updatedItem = { ...item, [field]: value };
                    
                    // Auto-calculate based on which field changed
                    if (field === 'total_cost' && value && item.required_quantity) {
                        updatedItem.price_per_unit = (parseFloat(value) / item.required_quantity).toFixed(2);
                    } else if (field === 'price_per_unit' && value && item.required_quantity) {
                        updatedItem.total_cost = (parseFloat(value) * item.required_quantity).toFixed(2);
                    } else if (field === 'will_provide' && !value) {
                        // If dropping item, clear cost fields
                        updatedItem.total_cost = '';
                        updatedItem.price_per_unit = '';
                        updatedItem.manufacturer_brand = '';
                    }
                    
                    return updatedItem;
                }
                return item;
            })
        }));
    };

    const handleInputChange = (field, value) => {
        setBidData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleFileChange = (field, file) => {
        setBidData(prev => ({
            ...prev,
            [field]: file
        }));
    };

    const validateStep1 = () => {
        const providedItems = bidData.items.filter(item => item.will_provide);
        
        if (providedItems.length === 0) {
            setError('You must provide at least one item or drop the tender entirely');
            return false;
        }

        const invalidItems = providedItems.filter(item => 
            !item.total_cost || parseFloat(item.total_cost) <= 0 ||
            !item.price_per_unit || parseFloat(item.price_per_unit) <= 0 ||
            !item.manufacturer_brand || item.manufacturer_brand.trim() === ''
        );

        if (invalidItems.length > 0) {
            setError('All items you choose to provide must have valid total cost, price per unit (> 0), and manufacturer/brand name');
            return false;
        }

        return true;
    };

    const validateStep2 = () => {
        if (!bidData.technicalBid || !bidData.financialBid) {
            setError('Both technical bid and financial bid documents are required');
            return false;
        }

        if (!bidData.deliveryTime || parseInt(bidData.deliveryTime) <= 0) {
            setError('Valid delivery time is required');
            return false;
        }

        const allowedTypes = ['application/pdf'];
        if (!allowedTypes.includes(bidData.technicalBid.type) || 
            !allowedTypes.includes(bidData.financialBid.type)) {
            setError('Only PDF files are allowed for bid documents');
            return false;
        }

        return true;
    };

    const validateStep3 = () => {
        if (!bidData.companyName.trim() || !bidData.registeredNumber.trim()) {
            setError('Company name and registered number are required');
            return false;
        }

        if (!bidData.agreeToTerms) {
            setError('You must agree to the terms and conditions');
            return false;
        }

        return true;
    };

    const handleNext = () => {
        setError('');
        
        if (currentStep === 1 && !validateStep1()) return;
        if (currentStep === 2 && !validateStep2()) return;
        if (currentStep === 3 && !validateStep3()) return; // existing step3 validation moves before new step4
        
        setCurrentStep(prev => prev + 1);
    };

    const handlePrevious = () => {
        setError('');
        setCurrentStep(prev => prev - 1);
    };

    const calculateTotalBidAmount = () => {
        return bidData.items
            .filter(item => item.will_provide && item.total_cost)
            .reduce((total, item) => total + parseFloat(item.total_cost), 0);
    };

    const calculateTotalQuantity = () => {
        return bidData.items
            .filter(item => item.will_provide)
            .reduce((total, item) => total + parseInt(item.required_quantity), 0);
    };

    const handleSubmit = async () => {
        setError('');
        // Step 4 is acknowledgment; ensure acknowledged
        if (!tender?.criteria_acknowledged) {
            setError('Please acknowledge all knockout clauses first.');
            return;
        }
        
        setLoading(true);
        
        try {
            const token = localStorage.getItem('supplierToken');
            console.log('BidApplication - submitting bid with token:', token ? 'present' : 'missing');
            const formData = new FormData();
            // Prepare items list again defensively
            const itemsData = bidData.items
                .filter(item => item.will_provide && item.total_cost && parseFloat(item.total_cost) > 0)
                .map(item => ({
                    item_id: item.id,
                    item_name: item.item_name,
                    required_quantity: item.required_quantity,
                    can_provide: parseInt(item.required_quantity), // Full quantity
                    total_cost: parseFloat(item.total_cost),
                    price_per_unit: parseFloat(item.price_per_unit),
                    manufacturer_brand: item.manufacturer_brand.trim(),
                    unit: item.unit
                }));

            if (itemsData.length === 0) {
                setError('Please choose to provide at least one item with valid pricing.');
                setLoading(false);
                return;
            }

            const totalCost = itemsData.reduce((s,i)=> s + i.total_cost, 0);
            const totalQuantity = itemsData.reduce((s,i)=> s + i.can_provide, 0);
            
            formData.append('proposedQuantity', totalQuantity);
            formData.append('totalCost', totalCost);
            formData.append('deliveryDays', parseInt(bidData.deliveryTime));
            formData.append('comments', bidData.comments || '');
            formData.append('technicalBid', bidData.technicalBid);
            formData.append('financialBid', bidData.financialBid);
            formData.append('items', JSON.stringify(itemsData));
            formData.append('companyName', bidData.companyName);
            formData.append('registeredNumber', bidData.registeredNumber);
            formData.append('agreeToTerms', bidData.agreeToTerms);

            const response = await fetch(`${apiUrl}/suppliers/tenders/${tender.id}/bid`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                let errorMsg = 'Failed to submit bid';
                try {
                    const errorData = await response.json();
                    console.error('BidApplication - Failed to submit bid:', response.status, response.statusText, errorData);
                    errorMsg = errorData.error || errorData.message || errorMsg;
                } catch(e) {
                    console.error('BidApplication - Error parsing error response');
                }
                throw new Error(errorMsg);
            }

            console.log('BidApplication - Bid submitted successfully');
            // Optional: show quick success toast if toast system available
            if (window?.toast) { try { window.toast.success('Bid submitted successfully'); } catch(e){} }
            handleSuccess();
            
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const renderStep1 = () => (
        <div className="space-y-6">
            <div className="border-b border-gray-200 pb-4">
                <h3 className="text-lg font-medium text-gray-900">Step 1: Item Details & Pricing</h3>
                <p className="text-sm text-gray-600 mt-1">
                    Choose which items to provide (full quantity only) and set your pricing
                </p>
                <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm text-yellow-800">
                        <strong>Note:</strong> You must provide the full required quantity for each item you choose. 
                        Partial quantities are not allowed. You can either provide the complete requirement or drop the item entirely.
                    </p>
                </div>
                {!tender?.criteria_acknowledged && (
                    <div className="mt-3 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-xs font-medium">
                        You have not acknowledged knockout clauses yet. You will not be able to submit this bid until acknowledgment is completed.
                    </div>
                )}
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-2">{getTenderDisplayName(tender)}</h4>
                <p className="text-sm text-blue-700 mb-2">{tender?.item_name}</p>
                <div className="text-sm text-blue-800 space-y-1">
                    <p><span className="font-medium">Description:</span> {tender?.description}</p>
                    <p><span className="font-medium">Urgency:</span> {tender?.urgency?.toUpperCase()}</p>
                    <p><span className="font-medium">Required By:</span> {new Date(tender?.required_by).toLocaleDateString()}</p>
                </div>
            </div>

            <div className="space-y-4">
                {bidData.items.map((item, index) => (
                    <div key={item.id} className={`border rounded-lg p-4 ${item.will_provide ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-medium text-gray-900">{item.item_name}</h4>
                            <div className="flex items-center space-x-3">
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        name={`item_${index}`}
                                        checked={item.will_provide}
                                        onChange={() => handleItemChange(index, 'will_provide', true)}
                                        className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300"
                                    />
                                    <span className="text-sm font-medium text-green-700">Provide Full Quantity</span>
                                </label>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        name={`item_${index}`}
                                        checked={!item.will_provide}
                                        onChange={() => handleItemChange(index, 'will_provide', false)}
                                        className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300"
                                    />
                                    <span className="text-sm font-medium text-red-700">Drop Item</span>
                                </label>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Required Quantity
                                </label>
                                <p className="text-sm text-gray-900 bg-white p-2 rounded border">
                                    {item.required_quantity} {item.unit}
                                </p>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    You Will Provide
                                </label>
                                <p className={`text-sm font-medium p-2 rounded border ${
                                    item.will_provide 
                                        ? 'bg-green-100 text-green-800 border-green-200' 
                                        : 'bg-red-100 text-red-800 border-red-200'
                                }`}>
                                    {item.will_provide ? `${item.required_quantity} ${item.unit} (Full)` : '0 (Dropped)'}
                                </p>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Total Cost (Rs) *
                                </label>
                                <input
                                    type="number"
                                    value={item.total_cost}
                                    onChange={(e) => handleItemChange(index, 'total_cost', e.target.value)}
                                    min="0"
                                    step="0.01"
                                    disabled={!item.will_provide}
                                    className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                                        !item.will_provide ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                                    }`}
                                    placeholder={item.will_provide ? "0.00" : "Item dropped"}
                                />
                                {item.will_provide && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        For {item.required_quantity} {item.unit}
                                    </p>
                                )}
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Price Per Unit (Rs) *
                                </label>
                                <input
                                    type="number"
                                    value={item.price_per_unit}
                                    onChange={(e) => handleItemChange(index, 'price_per_unit', e.target.value)}
                                    min="0"
                                    step="0.01"
                                    disabled={!item.will_provide}
                                    className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                                        !item.will_provide ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                                    }`}
                                    placeholder={item.will_provide ? "0.00" : "Item dropped"}
                                />
                                {item.will_provide && item.price_per_unit && item.total_cost && (
                                    <p className="text-xs text-green-600 mt-1">
                                        ✓ Auto-calculated
                                    </p>
                                )}
                            </div>
                        </div>

                        {item.will_provide && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Manufacturer/Brand Name *
                                </label>
                                <input
                                    type="text"
                                    value={item.manufacturer_brand}
                                    onChange={(e) => handleItemChange(index, 'manufacturer_brand', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Enter manufacturer or brand name"
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Specify the manufacturer or brand of the item you will provide
                                </p>
                            </div>
                        )}
                        
                        {item.remarks && (
                            <div className="mt-3">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Remarks
                                </label>
                                <p className="text-sm text-gray-600 bg-white p-2 rounded border">
                                    {item.remarks}
                                </p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-900 mb-2">Bid Summary</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                        <span className="font-medium text-green-800">Items Provided:</span> {bidData.items.filter(item => item.will_provide).length} / {bidData.items.length}
                    </div>
                    <div>
                        <span className="font-medium text-green-800">Total Quantity:</span> {calculateTotalQuantity()}
                    </div>
                    <div>
                        <span className="font-medium text-green-800">Total Amount:</span> Rs {calculateTotalBidAmount().toLocaleString()}
                    </div>
                </div>
                {bidData.items.filter(item => !item.will_provide).length > 0 && (
                    <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <p className="text-sm text-yellow-800">
                            <strong>Dropped Items:</strong> {bidData.items.filter(item => !item.will_provide).map(item => item.item_name).join(', ')}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );

    const renderStep2 = () => (
        <div className="space-y-6">
            <div className="border-b border-gray-200 pb-4">
                <h3 className="text-lg font-medium text-gray-900">Step 2: Technical & Financial Documents</h3>
                <p className="text-sm text-gray-600 mt-1">
                    Upload your technical and financial bid documents
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Technical Bid Document *
                    </label>
                    <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => handleFileChange('technicalBid', e.target.files[0])}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Upload your technical bid document (PDF only)</p>
                    {bidData.technicalBid && (
                        <p className="text-sm text-green-600 mt-1">✓ {bidData.technicalBid.name}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Financial Bid Document *
                    </label>
                    <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => handleFileChange('financialBid', e.target.files[0])}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Upload your financial bid document (PDF only)</p>
                    {bidData.financialBid && (
                        <p className="text-sm text-green-600 mt-1">✓ {bidData.financialBid.name}</p>
                    )}
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Delivery Time (Days) *
                </label>
                <input
                    type="number"
                    value={bidData.deliveryTime}
                    onChange={(e) => handleInputChange('deliveryTime', e.target.value)}
                    min="1"
                    className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter delivery time in days"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Additional Comments
                </label>
                <textarea
                    value={bidData.comments}
                    onChange={(e) => handleInputChange('comments', e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Any additional information or terms..."
                />
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div className="space-y-6">
            <div className="border-b border-gray-200 pb-4">
                <h3 className="text-lg font-medium text-gray-900">Step 3: Letter of Guarantee</h3>
                <p className="text-sm text-gray-600 mt-1">
                    Complete your company information and agree to terms
                </p>
            </div>

            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-4">Letter of Guarantee</h4>
                
                <div className="bg-white p-4 rounded border text-sm text-gray-700 leading-relaxed mb-4">
                    <p className="mb-3">
                        <strong>To: Regional Innovation Center (RIC)</strong><br/>
                        <strong>Subject: Letter of Guarantee for Tender Bid</strong>
                    </p>
                    
                    <p className="mb-3">
                        We, <span className="font-semibold underline">[COMPANY_NAME]</span>, 
                        with registration number <span className="font-semibold underline">[REGISTRATION_NUMBER]</span>, 
                        hereby guarantee that:
                    </p>
                    
                    <ul className="list-disc list-inside space-y-2 mb-3">
                        <li>All information provided in our bid is accurate and complete</li>
                        <li>We have the capability to fulfill the requirements as specified</li>
                        <li>We will deliver the goods/services within the agreed timeframe</li>
                        <li>We will honor all terms and conditions of the tender</li>
                        <li>Our bid prices are final and will remain valid for the bid evaluation period</li>
                    </ul>
                    
                    <p className="mb-3">
                        We understand that any false information or failure to comply with the terms 
                        may result in disqualification and potential legal action.
                    </p>
                    
                    <p>
                        This guarantee is valid from the date of submission until the completion 
                        of the tender process.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Company Name *
                        </label>
                        <input
                            type="text"
                            value={bidData.companyName}
                            onChange={(e) => handleInputChange('companyName', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Enter your company name"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Registered Number *
                        </label>
                        <input
                            type="text"
                            value={bidData.registeredNumber}
                            onChange={(e) => handleInputChange('registeredNumber', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Enter your registration number"
                        />
                    </div>
                </div>

                <div className="flex items-center">
                    <input
                        type="checkbox"
                        id="agreeToTerms"
                        checked={bidData.agreeToTerms}
                        onChange={(e) => handleInputChange('agreeToTerms', e.target.checked)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="agreeToTerms" className="ml-2 block text-sm text-gray-700">
                        I agree to all terms and conditions mentioned above and guarantee the accuracy of all information provided *
                    </label>
                </div>
            </div>
        </div>
    );

    const allKnockoutChecked = knockoutChecklist.length > 0 && knockoutChecklist.every(c => c.checked);

    const handleAcknowledge = async () => {
        try {
            setAcknowledging(true);
            setError('');
            if (!allKnockoutChecked) {
                setError('All knockout clauses must be checked.');
                return;
            }
            const token = localStorage.getItem('supplierToken');
            const resp = await fetch(`${apiUrl}/demands/tenders/${tender.id}/acknowledge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ knockoutChecklist: knockoutChecklist.map(k => ({ id: k.id, checked: k.checked })) })
            });
            if (!resp.ok) {
                const er = await resp.json().catch(()=>({message:'Failed'}));
                throw new Error(er.message || 'Failed to acknowledge');
            }
            setTender(prev => ({ ...prev, criteria_acknowledged: true }));
        } catch (e) {
            setError(e.message);
        } finally {
            setAcknowledging(false);
        }
    };

    const renderStep4 = () => (
        <div className="space-y-6">
            <div className="border-b border-gray-200 pb-4">
                <h3 className="text-lg font-medium text-gray-900">Step 4: Knockout Clauses & Acknowledgment</h3>
                <p className="text-sm text-gray-600 mt-1">You must confirm every knockout clause to proceed with bid submission.</p>
            </div>
            {!tender?.knockoutClauses || tender.knockoutClauses.length === 0 ? (
                <div className="bg-gray-50 border border-gray-200 p-4 rounded text-sm text-gray-600">No knockout clauses defined for this tender.</div>
            ) : (
                <div className="space-y-4">
                    <div className="bg-red-50 border border-red-200 p-4 rounded text-red-700 text-xs font-medium">
                        FAILURE TO MEET ANY KNOCKOUT CLAUSE WILL RESULT IN AUTOMATIC DISQUALIFICATION.
                    </div>
                    {tender.knockoutClauses.map((clause, idx) => (
                        <div key={clause.id} className="border border-red-200 rounded p-4 bg-red-50">
                            <div className="flex items-start">
                                <div className="flex items-center justify-center w-6 h-6 bg-red-600 text-white rounded-full text-xs font-bold mr-3">{idx+1}</div>
                                <div className="flex-1">
                                    <h4 className="font-semibold text-red-900">{clause.criteria_title}</h4>
                                    <p className="text-sm text-red-800 mt-1">{clause.criteria_description}</p>
                                    {clause.minimum_requirement && (
                                        <div className="mt-2 p-2 bg-red-100 rounded border border-red-300 text-xs text-red-900">
                                            <span className="font-medium">Minimum Requirement:</span> {clause.minimum_requirement}
                                        </div>
                                    )}
                                    {!tender.criteria_acknowledged && (
                                        <label className="mt-3 inline-flex items-start space-x-2 cursor-pointer">
                                            <input type="checkbox" className="h-4 w-4 text-red-600 border-gray-300 rounded"
                                                checked={knockoutChecklist.find(c=>c.id===clause.id)?.checked || false}
                                                onChange={(e)=> setKnockoutChecklist(prev => prev.map(c => c.id===clause.id ? { ...c, checked: e.target.checked } : c))}
                                            />
                                            <span className="text-xs text-red-900">I confirm compliance with this clause.</span>
                                        </label>
                                    )}
                                </div>
                                <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-600 text-white">KNOCKOUT</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {!tender?.criteria_acknowledged && (
                <button
                    onClick={handleAcknowledge}
                    disabled={!allKnockoutChecked || acknowledging}
                    className="px-4 py-2 text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50"
                >
                    {acknowledging ? 'Acknowledging...' : 'Acknowledge All Clauses'}
                </button>
            )}
            {tender?.criteria_acknowledged && (
                <div className="flex items-center text-green-600 text-sm font-medium">
                    <span className="mr-2">✓</span> Knockout clauses acknowledged.
                </div>
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-white shadow rounded-lg">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            <h1 className="text-2xl font-bold text-gray-900">Apply for Tender</h1>
                            <button
                                onClick={handleCancel}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                ✕
                            </button>
                        </div>
                        
                        {/* Progress Steps */}
                        <div className="mt-4">
                            <div className="flex items-center">
                                {[1, 2, 3, 4].map((step) => (
                                    <React.Fragment key={step}>
                                        <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                                            currentStep >= step 
                                                ? 'bg-indigo-600 text-white' 
                                                : 'bg-gray-200 text-gray-600'
                                        }`}>
                                            {step}
                                        </div>
                                        {step < 4 && (
                                            <div className={`flex-1 h-1 mx-2 ${
                                                currentStep > step ? 'bg-indigo-600' : 'bg-gray-200'
                                            }`} />
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                            <div className="flex justify-between text-xs text-gray-600 mt-2">
                                <span>Items</span>
                                <span>Documents</span>
                                <span>Guarantee</span>
                                <span>Knockout</span>
                            </div>
                        </div>
                    </div>

                    <div className="px-6 py-6">
                        {error && (
                            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                                {error}
                            </div>
                        )}

                        {currentStep === 1 && renderStep1()}
                        {currentStep === 2 && renderStep2()}
                        {currentStep === 3 && renderStep3()}
                        {currentStep === 4 && renderStep4()}
                    </div>

                    <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
                        <button
                            onClick={handlePrevious}
                            disabled={currentStep === 1}
                            className={`px-4 py-2 text-sm font-medium rounded-md ${
                                currentStep === 1
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                        >
                            Previous
                        </button>

                        <div className="flex space-x-3">
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            
                {currentStep < 4 ? (
                                <button
                                    onClick={handleNext}
                                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                                >
                                    Next
                                </button>
                            ) : (
                                <button
                                    onClick={handleSubmit}
                    disabled={loading || !tender?.criteria_acknowledged}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
                                >
                                    {loading ? 'Submitting...' : 'Submit Bid'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BidApplication;
