import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DemandManagement from '../admin/DemandManagement';
import SupplierEvaluation from '../admin/SupplierEvaluation';
import TechnicalEvaluationDashboard from '../committee/TechnicalEvaluationDashboard';
import PurchaseDepartment from '../department/PurchaseDepartment';
import GrievanceCommitteeNew from '../committee/GrievanceCommitteeNew';
import VettingDashboard from '../vetting/VettingDashboard';
import HodDashboard from '../hod/HodDashboard';
import MarketSurveyCommittee from '../committee/MarketSurveyCommittee';
import TwoFactorSetup from '../auth/TwoFactorSetup/TwoFactorSetup';
import { apiUrl } from '../../config/api';

export default function UserDashboard() {
  const navigate = useNavigate();
  const [demands, setDemands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('my-demands');
  const [show2FASetup, setShow2FASetup] = useState(false);

  // Check if user is Store department user
  const isStoreDepartmentUser = user?.departmentName && user.departmentName.toLowerCase() === 'store';
  
  // Check if user is Supplier Evaluation Committee member
  const isEvaluationCommittee = user?.committeeName && user.committeeName.toLowerCase() === 'supplier evaluation committee';
  
  // Check if user is Technical Evaluation Committee member
  const isTechnicalEvaluationCommittee = user?.committeeName && user.committeeName.toLowerCase().includes('technical evaluation');
  
  // Check if user is Purchase Department member
  const isPurchaseDepartment = user?.departmentName && user.departmentName.toLowerCase() === 'purchase';
  
  // Check if user is Grievance Committee member
  const isGrievanceCommittee = user?.committeeName && user.committeeName.toLowerCase().includes('grievance');
  
  // Check if user is Vetting Committee member
  const isVettingCommittee = user?.committeeName && user.committeeName.toLowerCase().includes('vetting');
  
  // Check if user is Market Survey Committee member
  const isMarketSurveyCommittee = user?.committeeName && user.committeeName.toLowerCase().includes('market survey');
  
  // Check if user is HOD
  const isHod = user?.isHod === 1 || user?.isHod === true;

  // Initialize user from localStorage once
  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      const userData = JSON.parse(stored);
      console.log('User data loaded:', userData);
      console.log('Department name:', userData.departmentName);
      setUser(userData);
    }
  }, []);
  useEffect(() => {
    if (user?.eligibleForDemandCreation || isStoreDepartmentUser || isPurchaseDepartment) {
      fetchUserDemands();
    }
  }, [user?.id, isStoreDepartmentUser, isPurchaseDepartment]);

  const fetchUserDemands = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/demands/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDemands(data);
      }
    } catch (error) {
      console.error('Error fetching demands:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDemand = () => {
    // Add debugging to see if the function is getting called
    console.log('Create demand button clicked, navigating to /create-demand');
    // Instead of opening modal, navigate to multi-step form
    navigate('/create-demand');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'pending_hod_approval': return 'bg-orange-100 text-orange-800';
      case 'hod_rejected': return 'bg-red-100 text-red-800';
      case 'available': return 'bg-green-100 text-green-800';
      case 'not_available': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'PENDING STORE REVIEW';
      case 'pending_hod_approval': return 'PENDING HOD APPROVAL';
      case 'hod_rejected': return 'REJECTED BY HOD';
      case 'available': return 'AVAILABLE';
      case 'not_available': return 'NOT AVAILABLE';
      default: return status?.replace('_', ' ').toUpperCase() || 'UNKNOWN';
    }
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'normal': return 'bg-blue-100 text-blue-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-8">      <div className="flex justify-between items-center mb-6">        <h1 className="text-2xl font-bold">
          {isStoreDepartmentUser ? 'Store Department Dashboard' : 
           isEvaluationCommittee ? 'Supplier Evaluation Committee Dashboard' :
           isPurchaseDepartment ? 'Purchase Department Dashboard' :
           isGrievanceCommittee ? 'Grievance Committee Dashboard' :
           isVettingCommittee ? 'Vetting Committee Dashboard' :
           isMarketSurveyCommittee ? 'Market Survey Committee Dashboard' :
           isHod ? 'Head of Department Dashboard' : 'User Dashboard'}
        </h1>
        <div className="flex space-x-3">
          {user?.eligibleForDemandCreation && (
            <button
              onClick={handleCreateDemand}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Create Demand
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation for Store Department Users (Non-HOD) */}
      {isStoreDepartmentUser && !isHod && (
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('my-demands')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'my-demands'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                My Demands
              </button>
              <button
                onClick={() => setActiveTab('manage-demands')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'manage-demands'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Manage All Demands
              </button>
            </nav>
          </div>
        </div>
      )}      {/* Tab Navigation for Supplier Evaluation Committee Users */}
      {isEvaluationCommittee && (
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('my-demands')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'my-demands'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                My Demands
              </button>
              <button
                onClick={() => setActiveTab('supplier-evaluation')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'supplier-evaluation'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Supplier Evaluation
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Tab Navigation for Technical Evaluation Committee Users */}
      {isTechnicalEvaluationCommittee && (
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('my-demands')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'my-demands'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                My Demands
              </button>
              <button
                onClick={() => setActiveTab('technical-evaluation')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'technical-evaluation'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Technical Evaluation
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Tab Navigation for Purchase Department Users (excluding HODs) */}
      {isPurchaseDepartment && !isHod && (
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('my-demands')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'my-demands'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                My Demands
              </button>
              <button
                onClick={() => setActiveTab('purchase-review')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'purchase-review'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Purchase Review
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Tab Navigation for HOD Users */}
      {isHod && (
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('my-demands')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'my-demands'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                My Demands
              </button>
              <button
                onClick={() => setActiveTab('hod-approval')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'hod-approval'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Department Approval
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Tab Navigation for Grievance Committee Users */}
      {isGrievanceCommittee && (
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('my-demands')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'my-demands'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                My Demands
              </button>
              <button
                onClick={() => setActiveTab('grievance-evaluation')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'grievance-evaluation'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Grievance Evaluation
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Tab Navigation for Vetting Committee Users */}
      {isVettingCommittee && (
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('my-demands')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'my-demands'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                My Demands
              </button>
              <button
                onClick={() => setActiveTab('vetting-evaluation')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'vetting-evaluation'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Tender Vetting
              </button>
            </nav>
          </div>
        </div>
      )}      {((!isStoreDepartmentUser && !isEvaluationCommittee && !isPurchaseDepartment && !isTechnicalEvaluationCommittee && !isGrievanceCommittee && !isVettingCommittee) || (activeTab === 'my-demands')) && (
        <div>
          <div className="mb-8">
            <p className="text-gray-600">Welcome back, {user?.name || 'User'}!</p>
            {user?.eligibleForDemandCreation && !isStoreDepartmentUser && !isEvaluationCommittee && !isPurchaseDepartment && (
              <p className="text-sm text-gray-500 mt-1">
                You can create demands using the button above. Your demands will be reviewed by the store department.
              </p>
            )}
            {user && !user.eligibleForDemandCreation && !isStoreDepartmentUser && !isEvaluationCommittee && !isPurchaseDepartment && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800">
                  You currently don't have permission to create demands. Please contact your administrator if you need access.
                </p>
              </div>
            )}
            {isStoreDepartmentUser && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800">
                  As a Store department member, you can view and manage all demands. Use the tabs above to switch between your personal demands and demand management.
                </p>
              </div>
            )}
            {isEvaluationCommittee && (
              <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-purple-800">
                  As a Supplier Evaluation Committee member, you can review and evaluate supplier registrations. Use the tabs above to switch between your personal demands and supplier evaluation.
                </p>
              </div>
            )}
            {isPurchaseDepartment && (
              <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-orange-800">
                  As a Purchase Department member, you can review and approve demands directly from the store department. Use the sidebar on the left to switch between sections.
                </p>
              </div>
            )}
            {isGrievanceCommittee && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800">
                  As a Grievance Committee member, you can review and address grievances raised by users. Use the tabs above to switch between your personal demands and grievance evaluation.
                </p>
              </div>
            )}
            {isVettingCommittee && (
              <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                <p className="text-indigo-800">
                  As a Vetting Committee member, you can review and approve/reject tenders submitted by the Purchase Department before they are published. Use the tabs above to switch between your personal demands and tender vetting.
                </p>
              </div>
            )}
          </div>

          {(user?.eligibleForDemandCreation) && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">My Demands</h2>
              </div>
              
              <div className="p-6">
                {loading ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-600">Loading demands...</p>
                  </div>
                ) : demands.length > 0 ? (
                  <div className="space-y-6">
                    {demands.map((demand) => (
                      <div key={demand.id} className="border rounded-lg p-6 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-semibold text-xl text-gray-900">
                              Demand #{demand.id}
                            </h3>
                            <p className="text-sm text-gray-600 mt-1">
                              Created on {new Date(demand.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex space-x-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(demand.status)}`}>
                              {getStatusText(demand.status)}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getUrgencyColor(demand.urgency)}`}>
                              {demand.urgency.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {/* Demand Summary */}
                        <div className="bg-gray-50 rounded-lg p-4 mb-4">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-700">Total Items:</span>
                              <span className="ml-2">{demand.items?.length || 1}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">Total Est. Cost:</span>
                              <span className="ml-2">Rs {demand.estimated_cost}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">Required By:</span>
                              <span className="ml-2">{new Date(demand.required_by).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="mt-3">
                            <span className="font-medium text-gray-700">Description:</span>
                            <p className="text-gray-600 mt-1">{demand.description}</p>
                          </div>
                        </div>

                        {/* HOD Response Details */}
                        {demand.hod_status && (
                          <div className={`rounded-lg p-4 mb-4 ${
                            demand.hod_status === 'approved' ? 'bg-green-50 border border-green-200' : 
                            demand.hod_status === 'rejected' ? 'bg-red-50 border border-red-200' : 'bg-gray-50'
                          }`}>
                            <h4 className="font-medium text-gray-900 mb-2">HOD Response</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="font-medium text-gray-700">Status:</span>
                                <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                                  demand.hod_status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {demand.hod_status.toUpperCase()}
                                </span>
                              </div>
                              {demand.hod_response_by_name && (
                                <div>
                                  <span className="font-medium text-gray-700">Reviewed By:</span>
                                  <span className="ml-2">{demand.hod_response_by_name}</span>
                                </div>
                              )}
                              {demand.hod_response_at && (
                                <div>
                                  <span className="font-medium text-gray-700">Response Date:</span>
                                  <span className="ml-2">{new Date(demand.hod_response_at).toLocaleDateString()}</span>
                                </div>
                              )}
                            </div>
                            {demand.hod_rejection_reason && (
                              <div className="mt-3">
                                <span className="font-medium text-gray-700">Rejection Reason:</span>
                                <p className="text-gray-600 mt-1 bg-white p-3 rounded border">{demand.hod_rejection_reason}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Items Display */}
                        {demand.items && demand.items.length > 0 ? (
                          <div className="mb-4">
                            <h4 className="font-medium text-gray-900 mb-3">Items Requested:</h4>
                            <div className="space-y-3">
                              {demand.items.map((item, index) => (
                                <div key={item.id} className="bg-white border rounded-lg p-4">
                                  <div className="flex justify-between items-start mb-2">
                                    <h5 className="font-medium text-gray-900">{item.item_name}</h5>
                                    {item.store_status && (
                                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                                        item.store_status === 'available' ? 'bg-green-100 text-green-800' :
                                        item.store_status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                      }`}>
                                        {item.store_status.toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-600">
                                    <div>
                                      <span className="font-medium">Quantity:</span> {item.quantity} {item.unit}
                                    </div>
                                    <div>
                                      <span className="font-medium">Est. Cost:</span> Rs {item.estimated_cost}
                                    </div>
                                    {item.store_available_quantity > 0 && (
                                      <div>
                                        <span className="font-medium">Store Available:</span> {item.store_available_quantity} {item.unit}
                                      </div>
                                    )}
                                    {item.unit && (
                                      <div>
                                        <span className="font-medium">Unit:</span> {item.unit}
                                      </div>
                                    )}
                                    {item.remarks && (
                                      <div className="col-span-2 md:col-span-4">
                                        <span className="font-medium">Remarks:</span> {item.remarks}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          // Fallback for old single-item demands
                          <div className="mb-4">
                            <h4 className="font-medium text-gray-900 mb-3">Item Details:</h4>
                            <div className="bg-white border rounded-lg p-4">
                              <h5 className="font-medium text-gray-900 mb-2">{demand.item_name}</h5>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-gray-600">
                                <div>
                                  <span className="font-medium">Quantity:</span> {demand.quantity} {demand.unit || 'pcs'}
                                </div>
                                <div>
                                  <span className="font-medium">Est. Cost:</span> Rs {demand.estimated_cost}
                                </div>
                                <div>
                                  <span className="font-medium">Unit:</span> {demand.unit || 'pcs'}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {demand.store_response && (
                          <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                            <p className="text-sm font-medium text-gray-900">Store Response:</p>
                            <p className="text-sm text-gray-700 mt-1">{demand.store_response}</p>
                            <p className="text-xs text-gray-500 mt-2">
                              Responded on {new Date(demand.store_response_at).toLocaleString()}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No demands created yet.</p>
                    {user?.eligibleForDemandCreation && (
                      <p className="text-sm text-gray-400 mt-1">Click "Create Demand" to get started.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}      {isStoreDepartmentUser && activeTab === 'manage-demands' && (
        <DemandManagement />
      )}

      {isEvaluationCommittee && activeTab === 'supplier-evaluation' && (
        <SupplierEvaluation />
      )}

      {isTechnicalEvaluationCommittee && activeTab === 'technical-evaluation' && (
        <TechnicalEvaluationDashboard />
      )}

      {isPurchaseDepartment && activeTab === 'purchase-review' && (
        <PurchaseDepartment />
      )}

      {isHod && activeTab === 'hod-approval' && (
        <HodDashboard />
      )}

      {isGrievanceCommittee && activeTab === 'grievance-evaluation' && (
        <GrievanceCommitteeNew />
      )}

      {isVettingCommittee && activeTab === 'vetting-evaluation' && (
        <VettingDashboard />
      )}

      {isMarketSurveyCommittee && (
        <MarketSurveyCommittee />
      )}

      {/* 2FA Setup Modal */}
      {show2FASetup && (
        <TwoFactorSetup onClose={() => setShow2FASetup(false)} />
      )}
    </div>
  );
}