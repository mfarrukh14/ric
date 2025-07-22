import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../../config/api';

const SupplierTenderView = ({ tenderId, onClose }) => {
  const [tender, setTender] = useState(null);
  const [loading, setLoading] = useState(true);
  const [criteriaAcknowledged, setCriteriaAcknowledged] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    if (tenderId) {
      fetchTenderDetails();
    }
  }, [tenderId]);

  const fetchTenderDetails = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/demands/tenders/${tenderId}/details`);
      setTender(response.data.tender);
      setCriteriaAcknowledged(response.data.tender.criteria_acknowledged || false);
    } catch (error) {
      console.error('Error fetching tender details:', error);
      toast.error('Failed to load tender details');
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledgeCriteria = async () => {
    try {
      setAcknowledging(true);
      await api.post(`/demands/tenders/${tenderId}/acknowledge`);
      setCriteriaAcknowledged(true);
      toast.success('Evaluation criteria acknowledged successfully');
    } catch (error) {
      console.error('Error acknowledging criteria:', error);
      toast.error('Failed to acknowledge criteria');
    } finally {
      setAcknowledging(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isExpired = (endTime) => {
    return new Date(endTime) < new Date();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!tender) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
          <div className="text-center py-12">
            <p className="text-gray-500">Tender not found or not accessible</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-6xl shadow-lg rounded-md bg-white mb-10">
        <div className="mt-3">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Tender Details</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tender Overview */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Tender Information</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-gray-500">Item:</span>
                    <p className="text-sm text-gray-900">{tender.item_name}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Description:</span>
                    <p className="text-sm text-gray-900">{tender.demand_description}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Category:</span>
                    <p className="text-sm text-gray-900">{tender.category}</p>
                  </div>
                  {tender.specifications && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">Specifications:</span>
                      <p className="text-sm text-gray-900">{tender.specifications}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Bidding Details</h3>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <i className="fas fa-clock h-5 w-5 text-gray-400 mr-2"></i>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Bidding Ends:</span>
                      <p className={`text-sm font-medium ${isExpired(tender.bidding_end_time) ? 'text-red-600' : 'text-green-600'}`}>
                        {formatDate(tender.bidding_end_time)}
                        {isExpired(tender.bidding_end_time) && ' (Expired)'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Status:</span>
                    <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      tender.tender_status === 'active' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {tender.tender_status.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Minimum Suppliers Required:</span>
                    <p className="text-sm text-gray-900">{tender.minimum_suppliers}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Critical Warning for Knockout Clauses */}
          {tender.knockoutClauses && tender.knockoutClauses.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
              <div className="flex">
                <i className="fas fa-exclamation-triangle h-5 w-5 text-red-400"></i>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    ⚠️ CRITICAL: Knockout Clauses Warning
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p className="font-semibold">
                      FAILURE TO MEET ANY OF THE FOLLOWING KNOCKOUT CLAUSES WILL RESULT IN AUTOMATIC DISQUALIFICATION FROM THIS TENDER.
                    </p>
                    <p className="mt-1">
                      Please review each requirement carefully before submitting your bid. There will be NO exceptions or appeals for knockout clause violations.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Knockout Clauses */}
          {tender.knockoutClauses && tender.knockoutClauses.length > 0 && (
            <div className="bg-white border border-red-300 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-red-900 mb-4 flex items-center">
                <i className="fas fa-exclamation-triangle h-5 w-5 text-red-500 mr-2"></i>
                Knockout Clauses (Mandatory Requirements)
              </h3>
              <div className="space-y-4">
                {tender.knockoutClauses.map((clause, index) => (
                  <div key={clause.id} className="border border-red-200 rounded-md p-4 bg-red-50">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <div className="flex items-center justify-center w-6 h-6 bg-red-600 text-white rounded-full text-xs font-bold">
                          {index + 1}
                        </div>
                      </div>
                      <div className="ml-3 flex-1">
                        <h4 className="font-semibold text-red-900">{clause.criteria_title}</h4>
                        <p className="text-sm text-red-800 mt-1">{clause.criteria_description}</p>
                        {clause.minimum_requirement && (
                          <div className="mt-2 p-2 bg-red-100 rounded border border-red-300">
                            <span className="text-xs font-medium text-red-900">Minimum Requirement:</span>
                            <p className="text-sm text-red-900">{clause.minimum_requirement}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 ml-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-600 text-white">
                          KNOCKOUT
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scoring Criteria */}
          {tender.scoringCriteria && tender.scoringCriteria.length > 0 && (
            <div className="bg-white border border-blue-300 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
                <i className="fas fa-file h-5 w-5 text-blue-500 mr-2"></i>
                Evaluation Criteria (Scoring)
              </h3>
              <div className="space-y-4">
                {tender.scoringCriteria.map((criteria, index) => (
                  <div key={criteria.id} className="border border-blue-200 rounded-md p-4 bg-blue-50">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <div className="flex items-center justify-center w-6 h-6 bg-blue-600 text-white rounded-full text-xs font-bold">
                          {index + 1}
                        </div>
                      </div>
                      <div className="ml-3 flex-1">
                        <h4 className="font-semibold text-blue-900">{criteria.criteria_title}</h4>
                        <p className="text-sm text-blue-800 mt-1">{criteria.criteria_description}</p>
                        {criteria.minimum_requirement && (
                          <div className="mt-2 p-2 bg-blue-100 rounded border border-blue-300">
                            <span className="text-xs font-medium text-blue-900">Minimum Requirement:</span>
                            <p className="text-sm text-blue-900">{criteria.minimum_requirement}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 ml-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-600 text-white">
                          {criteria.weightage}% Weight
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Document Downloads */}
          {(tender.tender_document_path || tender.items_list_path) && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Tender Documents</h3>
              <div className="flex space-x-4">
                {tender.tender_document_path && (
                  <a
                    href={`/api/demands/tenders/${tenderId}/tender-document`}
                    download
                    className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <i className="fas fa-file h-4 w-4 mr-2"></i>
                    Download Tender Document
                  </a>
                )}
                {tender.items_list_path && (
                  <a
                    href={`/api/demands/tenders/${tenderId}/items-list`}
                    download
                    className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <i className="fas fa-file h-4 w-4 mr-2"></i>
                    Download Items List
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Acknowledgment Section */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-yellow-900 mb-4">Mandatory Acknowledgment</h3>
            <div className="space-y-4">
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="acknowledge"
                  checked={criteriaAcknowledged}
                  readOnly={criteriaAcknowledged}
                  className="mt-1 h-4 w-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
                />
                <label htmlFor="acknowledge" className="ml-3 text-sm text-yellow-900">
                  <span className="font-medium">I acknowledge that I have read and understood all evaluation criteria, including knockout clauses.</span>
                  <p className="mt-1">
                    I understand that failure to meet any knockout clause will result in automatic disqualification from this tender, 
                    and that all scoring criteria will be used to evaluate my bid if I pass the knockout requirements.
                  </p>
                </label>
              </div>

              {!criteriaAcknowledged && (
                <button
                  onClick={handleAcknowledgeCriteria}
                  disabled={acknowledging}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50"
                >
                  {acknowledging ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Acknowledging...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check-circle h-4 w-4 mr-2"></i>
                      Acknowledge Criteria
                    </>
                  )}
                </button>
              )}

              {criteriaAcknowledged && (
                <div className="inline-flex items-center text-green-600">
                  <i className="fas fa-check-circle h-5 w-5 mr-2"></i>
                  <span className="font-medium">Criteria acknowledged successfully</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center border-t pt-6">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Close
            </button>
            
            {!isExpired(tender.bidding_end_time) && criteriaAcknowledged && (
              <button
                className="px-6 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
              >
                Proceed to Bid Submission
              </button>
            )}

            {isExpired(tender.bidding_end_time) && (
              <span className="px-6 py-2 text-sm text-red-600 font-medium">
                Bidding Period Has Expired
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupplierTenderView;
