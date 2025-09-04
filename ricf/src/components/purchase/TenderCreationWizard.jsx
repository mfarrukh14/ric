import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../../config/api';
import * as XLSX from 'xlsx';

const TenderCreationWizard = ({ demandId, onClose, onTenderCreated }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [demandItems, setDemandItems] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const itemsPerPage = 5;

  // Tender creation data
  const [tenderData, setTenderData] = useState({
    biddingEndTime: '',
    biddingEndDate: '',
    tenderDocument: null,
    itemsList: null,
    minimumSuppliers: 3,
    evaluationCriteria: []
  });

  // Form states
  const [approvalDecision, setApprovalDecision] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [newCriteria, setNewCriteria] = useState({
    title: '',
    description: '',
    isKnockout: true,
    minimumRequirement: '',
    weightage: 0
  });

  // Excel upload states
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [knockoutExcelFile, setKnockoutExcelFile] = useState(null);
  const [scoringExcelFile, setScoringExcelFile] = useState(null);

  const steps = [
    { number: 1, title: 'Review Items', description: 'Review demand items and make approval decision' },
    { number: 2, title: 'Tender Setup', description: 'Configure bidding details and upload documents' },
    { number: 3, title: 'Evaluation Criteria', description: 'Add knockout clauses and evaluation criteria' },
    { number: 4, title: 'Submit for Vetting', description: 'Final review and submit for vetting committee approval' }
  ];

  useEffect(() => {
    fetchDemandItems();
  }, [demandId, currentPage]);

  const fetchDemandItems = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/demands/${demandId}/items?page=${currentPage}&limit=${itemsPerPage}`);
      setDemandItems(response.data.items || []);
      setTotalPages(Math.ceil((response.data.total || 0) / itemsPerPage));
    } catch (error) {
      console.error('Error fetching demand items:', error);
      toast.error('Failed to load demand items');
    } finally {
      setLoading(false);
    }
  };

  const downloadExcelReport = async () => {
    try {
      const response = await api.get(`/demands/${demandId}/excel-report`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Demand_${demandId}_Annual_Report.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Excel report downloaded successfully');
    } catch (error) {
      console.error('Error downloading Excel report:', error);
      toast.error('Failed to download Excel report');
    }
  };

  const handleApprovalDecision = () => {
    if (approvalDecision === 'reject' && !rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    
    if (approvalDecision === 'approve') {
      setCurrentStep(2);
    } else {
      // Handle rejection - send back to demand creator
      handleRejectDemand();
    }
  };

  const handleRejectDemand = async () => {
    try {
      setLoading(true);
      await api.post(`/demands/${demandId}/reject`, {
        reason: rejectionReason,
        rejectedBy: localStorage.getItem('userId')
      });
      toast.success('Demand has been rejected and sent back for revision');
      onClose();
    } catch (error) {
      console.error('Error rejecting demand:', error);
      toast.error('Failed to reject demand');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (field, file) => {
    setTenderData(prev => ({
      ...prev,
      [field]: file
    }));
  };

  const addEvaluationCriteria = () => {
    if (!newCriteria.title.trim() || !newCriteria.description.trim()) {
      toast.error('Please fill in all required fields for the criteria');
      return;
    }

    setTenderData(prev => ({
      ...prev,
      evaluationCriteria: [
        ...prev.evaluationCriteria,
        {
          ...newCriteria,
          id: Date.now() // temporary ID
        }
      ]
    }));

    setNewCriteria({
      title: '',
      description: '',
      isKnockout: true,
      minimumRequirement: '',
      weightage: 0
    });
  };

  const removeCriteria = (id) => {
    setTenderData(prev => ({
      ...prev,
      evaluationCriteria: prev.evaluationCriteria.filter(criteria => criteria.id !== id)
    }));
  };

  // Excel processing functions
  const processExcelFile = (file, isKnockout = true) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          if (jsonData.length === 0) {
            reject(new Error('Excel file is empty'));
            return;
          }

          // Validate required columns based on type
          const requiredColumns = isKnockout 
            ? ['title', 'description'] 
            : ['title', 'description', 'weightage'];

          const firstRow = jsonData[0];
          const availableColumns = Object.keys(firstRow).map(col => col.toLowerCase());
          
          const missingColumns = requiredColumns.filter(col => 
            !availableColumns.includes(col.toLowerCase())
          );

          if (missingColumns.length > 0) {
            reject(new Error(`Missing required columns: ${missingColumns.join(', ')}`));
            return;
          }

          // Process data
          const processedData = jsonData.map((row, index) => {
            const title = row.title || row.Title || '';
            const description = row.description || row.Description || '';
            
            if (!title.trim() || !description.trim()) {
              throw new Error(`Row ${index + 1}: Title and Description are required`);
            }

            const criteria = {
              id: Date.now() + index,
              title: title.trim(),
              description: description.trim(),
              isKnockout: isKnockout,
              minimumRequirement: ''
            };

            if (!isKnockout) {
              const weightage = parseFloat(row.weightage || row.Weightage || 0);
              if (weightage <= 0 || weightage > 100) {
                throw new Error(`Row ${index + 1}: Weightage must be between 1 and 100`);
              }
              criteria.weightage = weightage;
            }

            return criteria;
          });

          resolve(processedData);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const handleExcelUpload = async (file, isKnockout = true) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload an Excel file (.xls or .xlsx)');
      return;
    }

    try {
      setUploadingExcel(true);
      const processedData = await processExcelFile(file, isKnockout);
      
      // Add to existing criteria
      setTenderData(prev => ({
        ...prev,
        evaluationCriteria: [...prev.evaluationCriteria, ...processedData]
      }));

      toast.success(`Successfully imported ${processedData.length} ${isKnockout ? 'knockout clauses' : 'scoring criteria'}`);
      
      // Clear file input
      if (isKnockout) {
        setKnockoutExcelFile(null);
      } else {
        setScoringExcelFile(null);
      }
    } catch (error) {
      console.error('Error processing Excel file:', error);
      toast.error(`Failed to process Excel file: ${error.message}`);
    } finally {
      setUploadingExcel(false);
    }
  };

  const downloadSampleExcel = (isKnockout = true) => {
    const sampleData = isKnockout ? [
      {
        title: 'Valid Trade License',
        description: 'Supplier must have a valid trade license from the relevant authority'
      },
      {
        title: 'Tax Registration',
        description: 'Valid tax registration certificate required'
      }
    ] : [
      {
        title: 'Years of Experience',
        description: 'Number of years in business',
        weightage: 20
      },
      {
        title: 'Quality Certifications',
        description: 'ISO or other quality certifications',
        weightage: 15
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sample');
    
    const fileName = isKnockout ? 'knockout_clauses_sample.xlsx' : 'scoring_criteria_sample.xlsx';
    XLSX.writeFile(workbook, fileName);
  };

  const createTender = async () => {
    try {
      setLoading(true);
      
      // Frontend validation
      if (!demandId) {
        toast.error('Demand ID is missing');
        return;
      }
      
      if (!tenderData.biddingEndDate || !tenderData.biddingEndTime) {
        toast.error('Bidding end date and time are required');
        return;
      }
      
      if (tenderData.evaluationCriteria.length === 0) {
        toast.error('At least one evaluation criteria is required');
        return;
      }
      
      const formData = new FormData();
      formData.append('demandId', demandId);
      formData.append('biddingEndTime', `${tenderData.biddingEndDate}T${tenderData.biddingEndTime}`);
      formData.append('minimumSuppliers', tenderData.minimumSuppliers);
      formData.append('evaluationCriteria', JSON.stringify(tenderData.evaluationCriteria));
      
      if (tenderData.tenderDocument) {
        formData.append('tenderDocument', tenderData.tenderDocument);
      }
      if (tenderData.itemsList) {
        formData.append('itemsList', tenderData.itemsList);
      }

      const response = await api.post('/demands/tenders/create', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      toast.success('Tender submitted for vetting committee approval!');
      onTenderCreated(response.data.tender);
      onClose();
    } catch (error) {
      console.error('Error creating tender:', error);
      
      // Handle specific error messages
      if (error.response?.status === 400) {
        const errorMessage = error.response?.data?.message || 'Bad request';
        
        if (errorMessage.includes('already exists')) {
          toast.error('A tender already exists for this demand. Please check the existing tender or contact the administrator.');
        } else if (errorMessage.includes('required')) {
          toast.error('Please fill in all required fields: ' + errorMessage);
        } else {
          toast.error('Validation error: ' + errorMessage);
        }
      } else {
        toast.error('Failed to create tender. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-8">
      {steps.map((step, index) => (
        <div key={step.number} className="flex items-center">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
            currentStep >= step.number 
              ? 'bg-blue-600 border-blue-600 text-white' 
              : 'border-gray-300 text-gray-500'
          }`}>
            {step.number}
          </div>
          <div className="ml-3">
            <p className={`text-sm font-medium ${
              currentStep >= step.number ? 'text-blue-600' : 'text-gray-500'
            }`}>
              {step.title}
            </p>
            <p className="text-xs text-gray-500">{step.description}</p>
          </div>
          {index < steps.length - 1 && (
            <div className={`mx-4 h-0.5 w-16 ${
              currentStep > step.number ? 'bg-blue-600' : 'bg-gray-300'
            }`} />
          )}
        </div>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Review Demand Items</h3>
        <button
          onClick={downloadExcelReport}
          className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          <i className="fas fa-download h-4 w-4 mr-2"></i>
          Download Annual Report
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {loading ? (
            <li className="px-6 py-4">
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            </li>
          ) : demandItems.length === 0 ? (
            <li className="px-6 py-4 text-center text-gray-500">No items found</li>
          ) : (
            demandItems.map((item) => (
              <li key={item.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        item.item_type === 'pharmaceutical' ? 'bg-green-100 text-green-800' :
                        item.item_type === 'equipment' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {item.category}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-sm text-gray-500">
                          <span className="font-medium">Quantity:</span> {item.quantity} {item.unit}
                        </p>
                        {item.prev_year_cost && (
                          <p className="text-sm text-gray-500">
                            <span className="font-medium">Previous Cost:</span> Rs. {item.prev_year_cost?.toLocaleString()}
                          </p>
                        )}
                      </div>
                      
                      {item.specifications && (
                        <div>
                          <p className="text-sm text-gray-500">
                            <span className="font-medium">Specifications:</span> {item.specifications}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Pharmaceutical specific details */}
                    {item.item_type === 'pharmaceutical' && item.pharmaceutical_details && (
                      <div className="bg-green-50 rounded-lg p-3 mb-2">
                        <h5 className="text-xs font-semibold text-green-800 mb-2">Pharmaceutical Details</h5>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                          {item.pharmaceutical_details.drug_category && (
                            <div>
                              <span className="font-medium text-green-700">Drug Category:</span>
                              <p className="text-green-600">{item.pharmaceutical_details.drug_category}</p>
                            </div>
                          )}
                          {item.pharmaceutical_details.drug_name && (
                            <div>
                              <span className="font-medium text-green-700">Drug Name:</span>
                              <p className="text-green-600">{item.pharmaceutical_details.drug_name}</p>
                            </div>
                          )}
                          {item.pharmaceutical_details.strength && (
                            <div>
                              <span className="font-medium text-green-700">Strength:</span>
                              <p className="text-green-600">{item.pharmaceutical_details.strength}</p>
                            </div>
                          )}
                          {item.pharmaceutical_details.dosage_form && (
                            <div>
                              <span className="font-medium text-green-700">Dosage Form:</span>
                              <p className="text-green-600">{item.pharmaceutical_details.dosage_form}</p>
                            </div>
                          )}
                          {item.pharmaceutical_details.preparation && (
                            <div>
                              <span className="font-medium text-green-700">Preparation:</span>
                              <p className="text-green-600">{item.pharmaceutical_details.preparation}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Equipment specific details */}
                    {item.item_type === 'equipment' && item.equipment_details && (
                      <div className="bg-blue-50 rounded-lg p-3 mb-2">
                        <h5 className="text-xs font-semibold text-blue-800 mb-2">Equipment Details</h5>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {item.equipment_details.equipment_category && (
                            <div>
                              <span className="font-medium text-blue-700">Equipment Category:</span>
                              <p className="text-blue-600">{item.equipment_details.equipment_category}</p>
                            </div>
                          )}
                          {item.equipment_details.equipment_type && (
                            <div>
                              <span className="font-medium text-blue-700">Equipment Type:</span>
                              <p className="text-blue-600">{item.equipment_details.equipment_type}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-medium text-gray-900">Rs. {item.estimated_cost?.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Est. Cost</p>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing page <span className="font-medium">{currentPage}</span> of{' '}
                <span className="font-medium">{totalPages}</span>
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  <i className="fas fa-chevron-left h-5 w-5"></i>
                </button>
                {[...Array(totalPages)].map((_, index) => (
                  <button
                    key={index + 1}
                    onClick={() => setCurrentPage(index + 1)}
                    className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                      currentPage === index + 1
                        ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                        : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  <i className="fas fa-chevron-right h-5 w-5"></i>
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}

      <div className="border-t pt-6">
        <h4 className="text-lg font-medium text-gray-900 mb-4">Approval Decision</h4>
        <div className="space-y-4">
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="approval"
                value="approve"
                checked={approvalDecision === 'approve'}
                onChange={(e) => setApprovalDecision(e.target.value)}
                className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-900">Approve and proceed to tender creation</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="approval"
                value="reject"
                checked={approvalDecision === 'reject'}
                onChange={(e) => setApprovalDecision(e.target.value)}
                className="h-4 w-4 text-red-600 border-gray-300 focus:ring-red-500"
              />
              <span className="ml-2 text-sm text-gray-900">Reject and send back for revision</span>
            </label>
          </div>

          {approvalDecision === 'reject' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Rejection *
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Please provide detailed reason for rejection..."
              />
            </div>
          )}

          <button
            onClick={handleApprovalDecision}
            disabled={!approvalDecision || (approvalDecision === 'reject' && !rejectionReason.trim())}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {approvalDecision === 'approve' ? 'Proceed to Tender Setup' : 'Submit Rejection'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Tender Setup</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Bidding End Date *
          </label>
          <input
            type="date"
            value={tenderData.biddingEndDate}
            onChange={(e) => setTenderData(prev => ({ ...prev, biddingEndDate: e.target.value }))}
            min={new Date().toISOString().split('T')[0]}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Bidding End Time *
          </label>
          <input
            type="time"
            value={tenderData.biddingEndTime}
            onChange={(e) => setTenderData(prev => ({ ...prev, biddingEndTime: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Minimum Number of Suppliers
        </label>
        <input
          type="number"
          min="1"
          value={tenderData.minimumSuppliers}
          onChange={(e) => setTenderData(prev => ({ ...prev, minimumSuppliers: parseInt(e.target.value) }))}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tender Document (PDF)
          </label>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => handleFileUpload('tenderDocument', e.target.files[0])}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {tenderData.tenderDocument && (
            <p className="text-sm text-green-600 mt-1">✓ {tenderData.tenderDocument.name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Items List (Excel/CSV)
          </label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => handleFileUpload('itemsList', e.target.files[0])}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {tenderData.itemsList && (
            <p className="text-sm text-green-600 mt-1">✓ {tenderData.itemsList.name}</p>
          )}
        </div>
      </div>

      <div className="flex justify-between pt-6 border-t">
        <button
          onClick={() => setCurrentStep(1)}
          className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          <i className="fas fa-chevron-left h-4 w-4 mr-2"></i>
          Back to Review
        </button>
        <button
          onClick={() => setCurrentStep(3)}
          disabled={!tenderData.biddingEndDate || !tenderData.biddingEndTime}
          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          Continue to Evaluation Criteria
          <i className="fas fa-chevron-right h-4 w-4 ml-2"></i>
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Evaluation Criteria & Knockout Clauses</h3>
      
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <div className="flex">
          <i className="fas fa-exclamation-triangle h-5 w-5 text-yellow-400"></i>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">Important Note</h3>
            <p className="text-sm text-yellow-700 mt-1">
              Knockout clauses are mandatory requirements. Suppliers who fail to meet these criteria will be automatically disqualified.
            </p>
          </div>
        </div>
      </div>

      <div className="border border-gray-300 rounded-md p-4">
        <h4 className="text-md font-medium text-gray-900 mb-4">Add New Evaluation Criteria</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Criteria Title *
            </label>
            <input
              type="text"
              value={newCriteria.title}
              onChange={(e) => setNewCriteria(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Valid Trade License"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type
            </label>
            <select
              value={newCriteria.isKnockout}
              onChange={(e) => setNewCriteria(prev => ({ ...prev, isKnockout: e.target.value === 'true' }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="true">Knockout Clause</option>
              <option value="false">Scoring Criteria</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description *
          </label>
          <textarea
            value={newCriteria.description}
            onChange={(e) => setNewCriteria(prev => ({ ...prev, description: e.target.value }))}
            rows={3}
            placeholder="Detailed description of the requirement..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minimum Requirement
            </label>
            <input
              type="text"
              value={newCriteria.minimumRequirement}
              onChange={(e) => setNewCriteria(prev => ({ ...prev, minimumRequirement: e.target.value }))}
              placeholder="e.g., Minimum 5 years validity"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {!newCriteria.isKnockout && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Weightage (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={newCriteria.weightage}
                onChange={(e) => setNewCriteria(prev => ({ ...prev, weightage: parseFloat(e.target.value) }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 pt-4 mb-4">
          <h5 className="text-sm font-medium text-gray-900 mb-3">Bulk Upload from Excel</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Knockout Clauses Upload */}
            <div className="border border-gray-200 rounded-md p-3">
              <h6 className="text-sm font-medium text-gray-700 mb-2">Knockout Clauses</h6>
              <div className="space-y-2">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setKnockoutExcelFile(e.target.files[0])}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                />
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleExcelUpload(knockoutExcelFile, true)}
                    disabled={!knockoutExcelFile || uploadingExcel}
                    className="flex-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {uploadingExcel ? 'Processing...' : 'Upload'}
                  </button>
                  <button
                    onClick={() => downloadSampleExcel(true)}
                    className="flex-1 px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    Sample
                  </button>
                </div>
              </div>
            </div>

            {/* Scoring Criteria Upload */}
            <div className="border border-gray-200 rounded-md p-3">
              <h6 className="text-sm font-medium text-gray-700 mb-2">Scoring Criteria</h6>
              <div className="space-y-2">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setScoringExcelFile(e.target.files[0])}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                />
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleExcelUpload(scoringExcelFile, false)}
                    disabled={!scoringExcelFile || uploadingExcel}
                    className="flex-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {uploadingExcel ? 'Processing...' : 'Upload'}
                  </button>
                  <button
                    onClick={() => downloadSampleExcel(false)}
                    className="flex-1 px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    Sample
                  </button>
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Upload Excel files with criteria data. Required columns: Title, Description. 
            For scoring criteria, also include Weightage column.
          </p>
        </div>

        <button
          onClick={addEvaluationCriteria}
          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
        >
          <i className="fas fa-plus h-4 w-4 mr-2"></i>
          Add Criteria Manually
        </button>
      </div>

      {tenderData.evaluationCriteria.length > 0 && (
        <div>
          <h4 className="text-md font-medium text-gray-900 mb-4">Added Evaluation Criteria</h4>
          <div className="space-y-3">
            {tenderData.evaluationCriteria.map((criteria) => (
              <div key={criteria.id} className="border border-gray-200 rounded-md p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h5 className="font-medium text-gray-900">{criteria.title}</h5>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        criteria.isKnockout 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {criteria.isKnockout ? 'Knockout' : 'Scoring'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{criteria.description}</p>
                    {criteria.minimumRequirement && (
                      <p className="text-sm text-gray-500">Minimum: {criteria.minimumRequirement}</p>
                    )}
                    {!criteria.isKnockout && criteria.weightage > 0 && (
                      <p className="text-sm text-gray-500">Weightage: {criteria.weightage}%</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeCriteria(criteria.id)}
                    className="ml-4 text-red-600 hover:text-red-800"
                  >
                    <i className="fas fa-trash h-4 w-4"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between pt-6 border-t">
        <button
          onClick={() => setCurrentStep(2)}
          className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          <i className="fas fa-chevron-left h-4 w-4 mr-2"></i>
          Back to Setup
        </button>
        <button
          onClick={() => setCurrentStep(4)}
          disabled={tenderData.evaluationCriteria.length === 0}
          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          Continue to Review
          <i className="fas fa-chevron-right h-4 w-4 ml-2"></i>
        </button>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Submit for Vetting Committee Approval</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Tender Details</h4>
          <div className="space-y-2 text-sm">
            <p><span className="font-medium">Bidding End:</span> {tenderData.biddingEndDate} at {tenderData.biddingEndTime}</p>
            <p><span className="font-medium">Minimum Suppliers:</span> {tenderData.minimumSuppliers}</p>
            <p><span className="font-medium">Tender Document:</span> {tenderData.tenderDocument ? '✓ Uploaded' : '✗ Not uploaded'}</p>
            <p><span className="font-medium">Items List:</span> {tenderData.itemsList ? '✓ Uploaded' : '✗ Not uploaded'}</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Evaluation Criteria Summary</h4>
          <div className="space-y-2 text-sm">
            <p><span className="font-medium">Total Criteria:</span> {tenderData.evaluationCriteria.length}</p>
            <p><span className="font-medium">Knockout Clauses:</span> {tenderData.evaluationCriteria.filter(c => c.isKnockout).length}</p>
            <p><span className="font-medium">Scoring Criteria:</span> {tenderData.evaluationCriteria.filter(c => !c.isKnockout).length}</p>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex">
          <i className="fas fa-info-circle h-5 w-5 text-blue-400"></i>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Vetting Committee Review</h3>
            <p className="text-sm text-blue-700 mt-1">
              This tender will be submitted to the vetting committee for approval. All committee members must approve before the tender can be published. You will be notified of the decision and can proceed to publish if approved.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-6 border-t">
        <button
          onClick={() => setCurrentStep(3)}
          className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          <i className="fas fa-chevron-left h-4 w-4 mr-2"></i>
          Back to Criteria
        </button>
        <button
          onClick={createTender}
          disabled={loading}
          className="inline-flex items-center px-6 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Submitting...
            </>
          ) : (
            'Submit for HOD Approval'
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Create Tender</h1>
              <p className="text-gray-600">Configure and publish tender for demand items</p>
            </div>
            <button
              onClick={onClose}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <i className="fas fa-arrow-left h-4 w-4 mr-2"></i>
              Back to Dashboard
            </button>
          </div>
        </div>

        {renderStepIndicator()}

        <div className="min-h-96 bg-white shadow rounded-lg p-6">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
        </div>
      </div>
    </div>
  );
};

export default TenderCreationWizard;
