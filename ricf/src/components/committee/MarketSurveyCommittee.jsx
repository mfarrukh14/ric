import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api, { apiUrl } from '../../config/api';

const MarketSurveyCommittee = () => {
    const [surveys, setSurveys] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showEvaluationModal, setShowEvaluationModal] = useState(false);
    const [selectedSurvey, setSelectedSurvey] = useState(null);
    const [evaluationForm, setEvaluationForm] = useState({
        evaluationNotes: '',
        documents: []
    });

    useEffect(() => {
        fetchSurveys();
    }, []);

    const fetchSurveys = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/market-survey/surveys`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch market surveys');
            }
            
            const data = await response.json();
            setSurveys(data.data || []);
        } catch (err) {
            console.error('Error fetching market surveys:', err);
            toast.error('Failed to load market surveys');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitEvaluation = (survey) => {
        setSelectedSurvey(survey);
        setShowEvaluationModal(true);
    };

    const handleEvaluationSubmit = async (e) => {
        e.preventDefault();
        
        if (!selectedSurvey) {
            toast.error('No survey selected');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('evaluationNotes', evaluationForm.evaluationNotes);
            
            // Add multiple documents
            if (evaluationForm.documents && evaluationForm.documents.length > 0) {
                for (let i = 0; i < evaluationForm.documents.length; i++) {
                    formData.append('documents', evaluationForm.documents[i]);
                }
            }

            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/market-survey/submit-evaluation/${selectedSurvey.survey_id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to submit evaluation');
            }

            const data = await response.json();
            toast.success('Market survey evaluation submitted successfully');
            
            // Reset form and close modal
            setEvaluationForm({ evaluationNotes: '', documents: [] });
            setShowEvaluationModal(false);
            setSelectedSurvey(null);
            
            // Refresh the surveys list
            fetchSurveys();

        } catch (err) {
            console.error('Error submitting evaluation:', err);
            toast.error(err.message || 'Failed to submit evaluation');
        }
    };

    const handleEvaluationDocumentChange = (e) => {
        const files = Array.from(e.target.files);
        setEvaluationForm(prev => ({
            ...prev,
            documents: files
        }));
    };

    const downloadDocument = async (documentId, originalFilename) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/market-survey/download/${documentId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error('Failed to download document');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = originalFilename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Error downloading document:', err);
            toast.error('Failed to download document');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                    <p className="text-gray-600 mt-4">Loading market surveys...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <div className="px-4 py-5 sm:p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h1 className="text-2xl font-bold text-gray-900">
                                <i className="fas fa-chart-line mr-3"></i>
                                Market Survey Committee
                            </h1>
                            <button
                                onClick={fetchSurveys}
                                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                            >
                                <i className="fas fa-sync-alt mr-2"></i>
                                Refresh
                            </button>
                        </div>

                        {surveys.length === 0 ? (
                            <div className="text-center py-12">
                                <i className="fas fa-chart-line text-gray-400 text-4xl mb-4"></i>
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No Market Surveys</h3>
                                <p className="text-gray-500">There are no market surveys assigned to your committee.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Tender Details
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Item Information
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Documents
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {surveys.map((survey) => (
                                            <tr key={survey.survey_id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">
                                                        Tender #{survey.tender_id}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        Sent by: {survey.sent_by_name}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        Sent: {new Date(survey.sent_at).toLocaleDateString()}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {survey.item_name}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        Qty: {survey.quantity}
                                                    </div>
                                                    <div className="text-sm text-gray-500 max-w-xs truncate">
                                                        {survey.description}
                                                    </div>
                                                    {survey.notes && (
                                                        <div className="text-sm text-blue-600 max-w-xs truncate mt-1">
                                                            Notes: {survey.notes}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {survey.documents && survey.documents.length > 0 ? (
                                                        <div className="space-y-1">
                                                            {survey.documents.map((doc) => (
                                                                <div key={doc.id} className="flex items-center">
                                                                    <button
                                                                        onClick={() => downloadDocument(doc.id, doc.original_filename)}
                                                                        className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center"
                                                                    >
                                                                        <i className="fas fa-download mr-1"></i>
                                                                        {doc.original_filename}
                                                                    </button>
                                                                    <span className={`ml-2 px-1 py-0.5 text-xs rounded ${
                                                                        doc.document_type === 'supporting' 
                                                                            ? 'bg-blue-100 text-blue-800'
                                                                            : 'bg-green-100 text-green-800'
                                                                    }`}>
                                                                        {doc.document_type}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-gray-400">No documents</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                        survey.survey_status === 'completed' 
                                                            ? 'bg-green-100 text-green-800'
                                                            : 'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                        {survey.survey_status === 'completed' ? 'Completed' : 'Pending'}
                                                    </span>
                                                    {survey.completed_at && (
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            Completed: {new Date(survey.completed_at).toLocaleDateString()}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                    {survey.survey_status === 'pending' ? (
                                                        <button
                                                            onClick={() => handleSubmitEvaluation(survey)}
                                                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                                                        >
                                                            <i className="fas fa-check mr-1"></i>
                                                            Submit Evaluation
                                                        </button>
                                                    ) : (
                                                        <span className="text-green-600 font-medium">
                                                            <i className="fas fa-check-circle mr-1"></i>
                                                            Evaluation Completed
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Evaluation Modal */}
            {showEvaluationModal && selectedSurvey && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-medium text-gray-900">
                                <i className="fas fa-check mr-2"></i>
                                Submit Market Survey Evaluation
                            </h3>
                            <button
                                onClick={() => setShowEvaluationModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="mb-4 p-3 bg-gray-50 rounded">
                            <p className="text-sm font-medium text-gray-900">
                                Tender #{selectedSurvey.tender_id}
                            </p>
                            <p className="text-sm text-gray-600">{selectedSurvey.item_name}</p>
                            <p className="text-xs text-gray-500">Quantity: {selectedSurvey.quantity}</p>
                        </div>

                        <form onSubmit={handleEvaluationSubmit}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Evaluation Notes <span className="text-gray-500">(Optional)</span>
                                </label>
                                <textarea
                                    value={evaluationForm.evaluationNotes}
                                    onChange={(e) => setEvaluationForm(prev => ({ ...prev, evaluationNotes: e.target.value }))}
                                    rows={4}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                                    placeholder="Add your market survey evaluation notes, findings, recommendations..."
                                />
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Evaluation Documents <span className="text-gray-500">(Optional)</span>
                                </label>
                                <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                                    onChange={handleEvaluationDocumentChange}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Upload evaluation reports, market analysis, price comparisons, etc. Maximum 10 files.
                                </p>
                                {evaluationForm.documents.length > 0 && (
                                    <div className="mt-2">
                                        <p className="text-sm font-medium text-gray-700">Selected files:</p>
                                        <ul className="text-xs text-gray-600">
                                            {Array.from(evaluationForm.documents).map((file, index) => (
                                                <li key={index}>• {file.name}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowEvaluationModal(false);
                                        setEvaluationForm({ evaluationNotes: '', documents: [] });
                                    }}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                                >
                                    <i className="fas fa-check mr-2"></i>
                                    Submit Evaluation
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarketSurveyCommittee;
