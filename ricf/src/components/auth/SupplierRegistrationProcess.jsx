import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../../config/api';

const SupplierRegistrationProcess = ({ supplierId, onComplete, isResubmission }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1 - Business Profile
    businessProfile: {
      businessEntityType: '',
      businessCategory: '',
      businessIndustry: '',
      description: '',
      ibanNumber: '',
      businessName: '',
      contactPersonName: '',
      originClassification: '',
      originCountry: '',
      dateOfIncorporation: '',
      websiteUrl: '',
      businessMobileNumber: '',
      businessFaxNumber: ''
    },
    // Step 3 - Registration Bodies
    registrationBodies: [],
    // Step 4 - Documents
    documents: {},
    // Step 5 - Business Addresses
    addresses: [],
    // Step 6 - Past Experience Record
    pastExperience: [],
    workProofImages: [],
    clientReferences: [],
    // Step 7 - PPRA Registrations
    ppraRegistrations: []
  });
  
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [modalData, setModalData] = useState({});
  const [emailOTP, setEmailOTP] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [declaration, setDeclaration] = useState(false);
  const [resubmissionFeedback, setResubmissionFeedback] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState(''); // 'saving', 'saved', 'error', ''
  const [autoSaveTimeout, setAutoSaveTimeout] = useState(null); // Debounced auto-save timeout

  // Fetch existing registration data on component mount
  useEffect(() => {
    const fetchExistingData = async () => {
      if (!supplierId) return;

      try {
        setLoading(true);
        const response = await fetch(`${apiUrl}/suppliers/registration-data`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('supplierToken')}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Fetched registration data:', data);

          // Update form data with existing data
          setFormData(prevData => ({
            ...prevData,
            businessProfile: data.businessProfile || prevData.businessProfile,
            registrationBodies: data.registrationBodies || [],
            addresses: data.addresses || [],
            pastExperience: data.pastExperience || [],
            workProofImages: data.workProofImages || [],
            clientReferences: data.clientReferences || [],
            ppraRegistrations: data.ppraRegistrations || [],
            // Preserve existing documents info for display
            documents: {
              ...prevData.documents,
              // Map existing documents to show they're already uploaded
              ...(data.documents ? Object.keys(data.documents).reduce((acc, docType) => {
                acc[docType] = {
                  ...data.documents[docType],
                  // Mark as existing file
                  isExisting: true
                };
                return acc;
              }, {}) : {})
            }
          }));

          // Set resubmission feedback if available
          if (data.resubmissionFeedback) {
            console.log('Setting resubmission feedback:', data.resubmissionFeedback);
            
            // Format the feedback data for display
            const formattedFeedback = {
              evaluatorName: data.resubmissionFeedback.evaluatorName || 'Supplier Evaluation Committee',
              requestedAt: data.resubmissionFeedback.requestedAt || new Date().toISOString(),
              overallComment: data.resubmissionFeedback.overallComment || data.resubmissionFeedback.additionalMessage || '',
              failedCriteria: data.resubmissionFeedback.failedCriteria || [],
              issues: data.resubmissionFeedback.issues || []
            };
            
            console.log('Formatted feedback:', formattedFeedback);
            setResubmissionFeedback(formattedFeedback);
          } else {
            console.log('No resubmission feedback found in data');
          }

          // Set current step and verification status based on supplier's progress
          if (data.supplier) {
            const registrationStep = data.supplier.registrationStep || 1;
            const emailVerified = data.supplier.emailVerified || false;
            
            // Skip email verification step if already verified or if it's a resubmission
            if (emailVerified || isResubmission) {
              setEmailVerified(true);
              setOtpSent(true);
              // If user was on step 2 (email verification) but it's already verified,
              // move to next step
              if (registrationStep === 2 && emailVerified) {
                setCurrentStep(3);
              } else {
                setCurrentStep(Math.max(1, registrationStep));
              }
            } else {
              setCurrentStep(Math.max(1, registrationStep));
            }
          }

          setDataLoaded(true);
          console.log('Registration data loaded successfully');
        } else {
          console.warn('Failed to fetch registration data:', response.status);
          // Don't show error for missing data - user can still fill new data
          setDataLoaded(true);
        }
      } catch (error) {
        console.error('Error fetching registration data:', error);
        // Don't show error for missing data - user can still fill new data
        setDataLoaded(true);
      } finally {
        setLoading(false);
      }
    };

    fetchExistingData();
  }, [supplierId, isResubmission]);

  // Auto-save effect - saves data every 2 minutes
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      if (dataLoaded && !loading) {
        autoSaveCurrentStep();
      }
    }, 120000); // Auto-save every 2 minutes

    return () => clearInterval(autoSaveInterval);
  }, [currentStep, formData, dataLoaded, loading]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }
    };
  }, [autoSaveTimeout]);

  const navigate = useNavigate();

  const businessEntityTypes = [
    'Sole Proprietorship',
    'Partnership',
    'Private Limited Company',
    'Public Limited Company',
    'Limited Liability Company',
    'Corporation',
    'Cooperative',
    'Non-Profit Organization',
    'Government Entity'
  ];

  const businessCategories = [
    'Manufacturing',
    'Trading',
    'Services',
    'Construction',
    'Consulting',
    'Technology',
    'Healthcare',
    'Education',
    'Transportation',
    'Agriculture',
    'Other'
  ];

  const businessIndustries = [
    'Medical Equipment & Supplies',
    'Pharmaceuticals',
    'Laboratory Equipment',
    'Healthcare Services',
    'IT & Software',
    'Construction & Infrastructure',
    'Food & Beverages',
    'Textiles',
    'Chemicals',
    'Electronics',
    'Automotive',
    'Energy',
    'Other'
  ];

  const countries = [
    'Pakistan',
    'United States',
    'United Kingdom',
    'Germany',
    'France',
    'China',
    'India',
    'Japan',
    'Canada',
    'Australia',
    'Other'
  ];

  const registrationBodies = [
    'Securities and Exchange Commission of Pakistan (SECP)',
    'Registrar of Firms',
    'Board of Investment (BOI)',
    'Pakistan Medical and Dental Council (PMDC)',
    'Drug Regulatory Authority of Pakistan (DRAP)',
    'Pakistan Engineering Council (PEC)',
    'Institute of Chartered Accountants of Pakistan (ICAP)',
    'Other'
  ];

  const ppraTypes = [
    'Federal Public Procurement Regulatory Authority',
    'Punjab Public Procurement Regulatory Authority',
    'Sindh Public Procurement Regulatory Authority',
    'Balochistan Public Procurement Regulatory Authority',
    'Khyber Pakhtunkhwa Public Procurement Regulatory Authority',
    'Gilgit-Baltistan Public Procurement Regulatory Authority',
    'Azad Jammu & Kashmir Public Procurement Regulatory Authority'
  ];

  const steps = [
    { number: 1, title: 'Business Profile'},
    { number: 2, title: 'Email Verification'},
    { number: 3, title: 'Registration Bodies'},
    { number: 4, title: 'Supporting Documents'},
    { number: 5, title: 'Business Addresses'},
    { number: 6, title: 'Past Experience'},
    { number: 7, title: 'PPRA Registration'}
  ];

  const handleInputChange = (section, field, value) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));

    // Clear existing timeout
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }

    // Set new timeout for auto-save
    const newTimeout = setTimeout(() => {
      if (dataLoaded && !loading) {
        autoSaveCurrentStep();
      }
    }, 3000); // Auto-save 3 seconds after user stops typing

    setAutoSaveTimeout(newTimeout);
  };

  const handleFileChange = (documentType, file) => {
    setFormData(prev => ({
      ...prev,
      documents: {
        ...prev.documents,
        [documentType]: file
      }
    }));
    // Note: Documents are typically saved during final submission, not in step auto-save
  };

  const saveStep = async (stepNumber) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${apiUrl}/suppliers/registration/save-step`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supplierToken')}`
        },
        body: JSON.stringify({
          supplierId,
          step: stepNumber,
          data: formData
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save step');
      }

      // Update current step if this is a progression
      if (stepNumber > currentStep) {
        setCurrentStep(stepNumber);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const validateCurrentStep = () => {
    const errors = [];
    
    switch (currentStep) {
      case 1:
        const bp = formData.businessProfile;
        if (!bp.businessEntityType) errors.push('Business Entity Type is required');
        if (!bp.businessCategory) errors.push('Business Category is required');
        if (!bp.businessIndustry) errors.push('Business Industry is required');
        if (!bp.description) errors.push('Business Description is required');
        if (!bp.ibanNumber) errors.push('IBAN Number is required');
        if (!bp.businessName) errors.push('Business Name is required');
        if (!bp.contactPersonName) errors.push('Focal Person Full Name is required');
        if (!bp.originClassification) errors.push('Origin Classification is required');
        if (!bp.originCountry) errors.push('Origin Country is required');
        if (!bp.dateOfIncorporation) errors.push('Date of Incorporation is required');
        if (!bp.websiteUrl) errors.push('Website URL is required');
        if (!bp.businessMobileNumber) errors.push('Business Mobile Number is required');
        if (!bp.businessFaxNumber) errors.push('Business Fax Number is required');
        break;
      case 2:
        // Email verification is enforced by UI flow, no validation needed
        break;
      case 3:
        if (!formData.registrationBodies || formData.registrationBodies.length === 0) {
          errors.push('At least one Registration Body is required');
        }
        break;
      case 4:
        const requiredDocs = ['professionalTaxCert', 'ntnDocument', 'drugSaleLicense', 'pecDocument', 'gstDocument'];
        requiredDocs.forEach(docType => {
          if (!formData.documents[docType] || (!formData.documents[docType].isExisting && !formData.documents[docType].name)) {
            const docLabels = {
              'professionalTaxCert': 'Professional Tax Certificate',
              'ntnDocument': 'NTN Document',
              'drugSaleLicense': 'Drug Sale License',
              'pecDocument': 'PEC Document',
              'gstDocument': 'GST Document'
            };
            errors.push(`${docLabels[docType]} is required`);
          }
        });
        break;
      case 5:
        if (!formData.addresses || formData.addresses.length === 0) {
          errors.push('At least one Business Address is required');
        }
        break;
      case 6:
        // Past experience is optional as per user request
        break;
      case 7:
        if (!formData.ppraRegistrations || formData.ppraRegistrations.length === 0) {
          errors.push('At least one PPRA Registration is required');
        }
        break;
    }
    
    return errors;
  };

  const nextStep = async () => {
    if (currentStep < 7) {
      // Validate current step before moving to next
      const stepErrors = validateCurrentStep();
      if (stepErrors.length > 0) {
        const errorMessage = `Please complete the following required fields for Step ${currentStep}:\n\n${stepErrors.map(error => `• ${error}`).join('\n')}`;
        setError(errorMessage);
        return;
      }
      
      setError(''); // Clear any previous errors
      // Auto-save current step data before moving to next step
      await autoSaveCurrentStep();
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = async () => {
    if (currentStep > 1) {
      // Auto-save current step data before moving to previous step
      await autoSaveCurrentStep();
      setCurrentStep(currentStep - 1);
    }
  };

  // Auto-save function to save current step data
  const autoSaveCurrentStep = async () => {
    try {
      let dataToSave = null;
      let stepNumber = currentStep;

      switch (currentStep) {
        case 1:
          if (formData.businessProfile && Object.keys(formData.businessProfile).some(key => formData.businessProfile[key])) {
            dataToSave = { businessProfile: formData.businessProfile };
          }
          break;
        case 3:
          if (formData.registrationBodies && formData.registrationBodies.length > 0) {
            dataToSave = { registrationBodies: formData.registrationBodies };
          }
          break;
        case 5:
          if (formData.addresses && formData.addresses.length > 0) {
            dataToSave = { addresses: formData.addresses };
          }
          break;
        case 6:
          if ((formData.pastExperience && formData.pastExperience.length > 0) || 
              (formData.clientReferences && formData.clientReferences.length > 0) ||
              (formData.workProofImages && formData.workProofImages.length > 0)) {
            dataToSave = { 
              pastExperience: formData.pastExperience || [],
              clientReferences: formData.clientReferences || [],
              workProofImages: formData.workProofImages || []
            };
          }
          break;
        case 7:
          if (formData.ppraRegistrations && formData.ppraRegistrations.length > 0) {
            dataToSave = { ppraRegistrations: formData.ppraRegistrations };
          }
          break;
        default:
          return; // No auto-save for other steps
      }

      // Save the data if there's something to save
      if (dataToSave) {
        console.log(`🔄 Auto-saving step ${stepNumber} data...`);
        setAutoSaveStatus('saving');
        
        await saveStepData(stepNumber, dataToSave);
        
        console.log(`✅ Step ${stepNumber} auto-saved successfully`);
        setAutoSaveStatus('saved');
        
        // Clear the saved status after 2 seconds
        setTimeout(() => {
          setAutoSaveStatus('');
        }, 2000);
      }
    } catch (error) {
      console.warn(`⚠️ Auto-save failed for step ${currentStep}:`, error);
      setAutoSaveStatus('error');
      
      // Clear the error status after 3 seconds
      setTimeout(() => {
        setAutoSaveStatus('');
      }, 3000);
      
      // Don't block navigation if auto-save fails
    }
  };

  const sendEmailOTP = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/suppliers/send-email-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supplierToken')}`
        },
        body: JSON.stringify({ supplierId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send OTP');
      }

      setOtpSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyEmailOTP = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/suppliers/verify-email-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supplierToken')}`
        },
        body: JSON.stringify({
          supplierId,
          otp: emailOTP
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Invalid OTP');
      }

      setEmailVerified(true);
      nextStep();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (type, data = {}) => {
    setModalType(type);
    setModalData(data);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalType('');
    setModalData({});
  };

  const addRegistrationBody = (data) => {
    // Validate required fields
    if (!data.registrationBody || !data.registrationNumber || !data.registrationDate) {
      setError('Please fill in all required fields for Registration Body');
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      registrationBodies: [...prev.registrationBodies, { ...data, id: Date.now() }]
    }));
    closeModal();
    setError(''); // Clear any previous errors
    // Trigger auto-save after adding registration body
    setTimeout(() => {
      if (dataLoaded && !loading) {
        autoSaveCurrentStep();
      }
    }, 500);
  };

  const addAddress = (data) => {
    // Validate required fields
    if (!data.addressType || !data.addressLine1 || !data.city || !data.stateProvince || !data.postalCode || !data.country) {
      setError('Please fill in all required fields for Business Address');
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      addresses: [...prev.addresses, { ...data, id: Date.now() }]
    }));
    closeModal();
    setError(''); // Clear any previous errors
    // Trigger auto-save after adding address
    setTimeout(() => {
      if (dataLoaded && !loading) {
        autoSaveCurrentStep();
      }
    }, 500);
  };

  const addPPRARegistration = (data) => {
    // Validate required fields
    if (!data.ppraType || !data.registrationNumber || !data.registrationDate) {
      setError('Please fill in all required fields for PPRA Registration');
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      ppraRegistrations: [...prev.ppraRegistrations, { ...data, id: Date.now() }]
    }));
    closeModal();
    setError(''); // Clear any previous errors
    // Trigger auto-save after adding PPRA registration
    setTimeout(() => {
      if (dataLoaded && !loading) {
        autoSaveCurrentStep();
      }
    }, 500);
  };

  const addPastExperience = (data) => {
    setFormData(prev => ({
      ...prev,
      pastExperience: [...prev.pastExperience, { ...data, id: Date.now() }]
    }));
    closeModal();
    // Trigger auto-save after adding past experience
    setTimeout(() => {
      if (dataLoaded && !loading) {
        autoSaveCurrentStep();
      }
    }, 500);
  };

  const addClientReference = (data) => {
    setFormData(prev => ({
      ...prev,
      clientReferences: [...prev.clientReferences, { ...data, id: Date.now() }]
    }));
    closeModal();
    // Trigger auto-save after adding client reference
    setTimeout(() => {
      if (dataLoaded && !loading) {
        autoSaveCurrentStep();
      }
    }, 500);
  };

  const handleWorkProofImageChange = (files) => {
    const newImages = Array.from(files).map(file => ({
      file,
      id: Date.now() + Math.random(),
      preview: URL.createObjectURL(file)
    }));
    
    setFormData(prev => ({
      ...prev,
      workProofImages: [...prev.workProofImages, ...newImages]
    }));
    
    // Trigger auto-save after adding work proof images
    setTimeout(() => {
      if (dataLoaded && !loading) {
        autoSaveCurrentStep();
      }
    }, 500);
  };

  const removeWorkProofImage = (id) => {
    setFormData(prev => ({
      ...prev,
      workProofImages: prev.workProofImages.filter(img => {
        if (img.id === id && img.preview) {
          URL.revokeObjectURL(img.preview);
        }
        return img.id !== id;
      })
    }));
    
    // Trigger auto-save after removing work proof image
    setTimeout(() => {
      if (dataLoaded && !loading) {
        autoSaveCurrentStep();
      }
    }, 500);
  };

  const removeItem = (section, id) => {
    setFormData(prev => ({
      ...prev,
      [section]: prev[section].filter(item => item.id !== id)
    }));
    // Trigger auto-save after removing item
    setTimeout(() => {
      if (dataLoaded && !loading) {
        autoSaveCurrentStep();
      }
    }, 500);
  };

  const validateRequiredFields = () => {
    const errors = [];
    
    // Step 1 - Business Profile validation
    const bp = formData.businessProfile;
    if (!bp.businessEntityType) errors.push('Business Entity Type is required');
    if (!bp.businessCategory) errors.push('Business Category is required');
    if (!bp.businessIndustry) errors.push('Business Industry is required');
    if (!bp.description) errors.push('Business Description is required');
    if (!bp.ibanNumber) errors.push('IBAN Number is required');
    if (!bp.businessName) errors.push('Business Name is required');
    if (!bp.contactPersonName) errors.push('Focal Person Full Name is required');
    if (!bp.originClassification) errors.push('Origin Classification is required');
    if (!bp.originCountry) errors.push('Origin Country is required');
    if (!bp.dateOfIncorporation) errors.push('Date of Incorporation is required');
    if (!bp.websiteUrl) errors.push('Website URL is required');
    if (!bp.businessMobileNumber) errors.push('Business Mobile Number is required');
    if (!bp.businessFaxNumber) errors.push('Business Fax Number is required');

    // Step 2 - Email verification is enforced by UI flow, no validation needed

    // Step 3 - Registration Bodies validation
    if (!formData.registrationBodies || formData.registrationBodies.length === 0) {
      errors.push('At least one Registration Body is required');
    } else {
      formData.registrationBodies.forEach((body, index) => {
        if (!body.registrationBody) errors.push(`Registration Body #${index + 1}: Registration Body is required`);
        if (!body.registrationNumber) errors.push(`Registration Body #${index + 1}: Registration Number is required`);
        if (!body.registrationDate) errors.push(`Registration Body #${index + 1}: Registration Date is required`);
      });
    }

    // Step 4 - Documents validation
    const requiredDocs = ['professionalTaxCert', 'ntnDocument', 'drugSaleLicense', 'pecDocument', 'gstDocument'];
    requiredDocs.forEach(docType => {
      if (!formData.documents[docType] || (!formData.documents[docType].isExisting && !formData.documents[docType].name)) {
        const docLabels = {
          'professionalTaxCert': 'Professional Tax Certificate',
          'ntnDocument': 'NTN Document',
          'drugSaleLicense': 'Drug Sale License',
          'pecDocument': 'PEC Document',
          'gstDocument': 'GST Document'
        };
        errors.push(`${docLabels[docType]} is required`);
      }
    });

    // Step 5 - Business Addresses validation
    if (!formData.addresses || formData.addresses.length === 0) {
      errors.push('At least one Business Address is required');
    } else {
      formData.addresses.forEach((address, index) => {
        if (!address.addressType) errors.push(`Address #${index + 1}: Address Type is required`);
        if (!address.addressLine1) errors.push(`Address #${index + 1}: Address Line 1 is required`);
        if (!address.city) errors.push(`Address #${index + 1}: City is required`);
        if (!address.stateProvince) errors.push(`Address #${index + 1}: State/Province is required`);
        if (!address.postalCode) errors.push(`Address #${index + 1}: Postal Code is required`);
        if (!address.country) errors.push(`Address #${index + 1}: Country is required`);
      });
    }

    // Step 6 - Past Experience is optional as per user request
    // No validation needed for past experience

    // Step 7 - PPRA Registration validation
    if (!formData.ppraRegistrations || formData.ppraRegistrations.length === 0) {
      errors.push('At least one PPRA Registration is required');
    } else {
      formData.ppraRegistrations.forEach((ppra, index) => {
        if (!ppra.ppraType) errors.push(`PPRA Registration #${index + 1}: PPRA Type is required`);
        if (!ppra.registrationNumber) errors.push(`PPRA Registration #${index + 1}: Registration Number is required`);
        if (!ppra.registrationDate) errors.push(`PPRA Registration #${index + 1}: Registration Date is required`);
      });
    }

    return errors;
  };

  const submitApplication = async () => {
    if (!declaration) {
      setError('Please accept the declaration to proceed');
      return;
    }

    // Validate all required fields
    const validationErrors = validateRequiredFields();
    if (validationErrors.length > 0) {
      const errorMessage = `Please complete the following required fields:\n\n${validationErrors.map(error => `• ${error}`).join('\n')}`;
      setError(errorMessage);
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Save all steps before submitting to ensure all data is stored
      console.log('🔄 Saving all registration steps before submission...');
      
      // Save Step 1 - Business Profile
      if (formData.businessProfile && Object.keys(formData.businessProfile).length > 0) {
        console.log('💾 Saving Step 1 - Business Profile...');
        await saveStepData(1, { businessProfile: formData.businessProfile });
      }

      // Save Step 3 - Registration Bodies
      if (formData.registrationBodies && formData.registrationBodies.length > 0) {
        console.log('💾 Saving Step 3 - Registration Bodies...');
        await saveStepData(3, { registrationBodies: formData.registrationBodies });
      }

      // Save Step 5 - Business Addresses
      if (formData.addresses && formData.addresses.length > 0) {
        console.log('💾 Saving Step 5 - Business Addresses...');
        await saveStepData(5, { addresses: formData.addresses });
      }

      // Save Step 6 - Past Experience
      if ((formData.pastExperience && formData.pastExperience.length > 0) || 
          (formData.clientReferences && formData.clientReferences.length > 0) ||
          (formData.workProofImages && formData.workProofImages.length > 0)) {
        console.log('💾 Saving Step 6 - Past Experience...');
        await saveStepData(6, { 
          pastExperience: formData.pastExperience || [],
          clientReferences: formData.clientReferences || [],
          workProofImages: formData.workProofImages || []
        });
      }

      // Save Step 7 - PPRA Registrations
      if (formData.ppraRegistrations && formData.ppraRegistrations.length > 0) {
        console.log('💾 Saving Step 7 - PPRA Registrations...');
        await saveStepData(7, { ppraRegistrations: formData.ppraRegistrations });
      }

      console.log('✅ All registration steps saved successfully');

      // Now submit the application
      const formDataToSend = new FormData();
      
      // Add all form data
      formDataToSend.append('supplierId', supplierId);
      formDataToSend.append('formData', JSON.stringify(formData));
      
      // Add documents
      Object.keys(formData.documents).forEach(docType => {
        if (formData.documents[docType] && !formData.documents[docType].isExisting) {
          formDataToSend.append(docType, formData.documents[docType]);
        }
      });

      const response = await fetch(`${apiUrl}/suppliers/registration/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supplierToken')}`
        },
        body: formDataToSend
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit application');
      }

      console.log('🎉 Application submitted successfully');

      if (onComplete) {
        onComplete();
      } else {
        navigate('/login');
      }
    } catch (err) {
      console.error('❌ Submit application error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to save step data
  const saveStepData = async (stepNumber, data) => {
    try {
      const response = await fetch(`${apiUrl}/suppliers/registration/save-step`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('supplierToken')}`
        },
        body: JSON.stringify({
          supplierId,
          step: stepNumber,
          data: data
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to save step ${stepNumber}: ${errorData.error || 'Unknown error'}`);
      }

      console.log(`✅ Step ${stepNumber} saved successfully`);
    } catch (error) {
      console.error(`❌ Error saving step ${stepNumber}:`, error);
      throw error;
    }
  };

  const renderStep1 = () => (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold text-white mb-6">Business Classification</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Business Entity Type *
            </label>
            <select
              value={formData.businessProfile.businessEntityType}
              onChange={(e) => handleInputChange('businessProfile', 'businessEntityType', e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select Entity Type</option>
              {businessEntityTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Business Category *
            </label>
            <select
              value={formData.businessProfile.businessCategory}
              onChange={(e) => handleInputChange('businessProfile', 'businessCategory', e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select Category</option>
              {businessCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Business Industry *
            </label>
            <select
              value={formData.businessProfile.businessIndustry}
              onChange={(e) => handleInputChange('businessProfile', 'businessIndustry', e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select Industry</option>
              {businessIndustries.map(industry => (
                <option key={industry} value={industry}>{industry}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              IBAN Number *
            </label>
            <input
              type="text"
              value={formData.businessProfile.ibanNumber}
              onChange={(e) => handleInputChange('businessProfile', 'ibanNumber', e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="PK36SCBL0000001123456702"
              required
            />
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Description/Details *
          </label>
          <textarea
            value={formData.businessProfile.description}
            onChange={(e) => handleInputChange('businessProfile', 'description', e.target.value)}
            rows={4}
            className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Brief description of your business..."
            required
          />
        </div>
      </div>

      <div>
        <h3 className="text-xl font-semibold text-white mb-6">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Business Name *
            </label>
            <input
              type="text"
              value={formData.businessProfile.businessName}
              onChange={(e) => handleInputChange('businessProfile', 'businessName', e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter business name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Focal Person Full Name *
            </label>
            <input
              type="text"
              value={formData.businessProfile.contactPersonName}
              onChange={(e) => handleInputChange('businessProfile', 'contactPersonName', e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter full name of focal person"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Origin Classification *
            </label>
            <select
              value={formData.businessProfile.originClassification}
              onChange={(e) => handleInputChange('businessProfile', 'originClassification', e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select Classification</option>
              <option value="local">Local</option>
              <option value="international">International</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Origin Country *
            </label>
            <select
              value={formData.businessProfile.originCountry}
              onChange={(e) => handleInputChange('businessProfile', 'originCountry', e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select Country</option>
              {countries.map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Date of Incorporation *
            </label>
            <input
              type="date"
              value={formData.businessProfile.dateOfIncorporation}
              onChange={(e) => handleInputChange('businessProfile', 'dateOfIncorporation', e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Website URL *
            </label>
            <input
              type="url"
              value={formData.businessProfile.websiteUrl}
              onChange={(e) => handleInputChange('businessProfile', 'websiteUrl', e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://www.example.com"
              required
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-semibold text-white mb-6">Contact Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Business Mobile Number *
            </label>
            <input
              type="tel"
              value={formData.businessProfile.businessMobileNumber}
              onChange={(e) => handleInputChange('businessProfile', 'businessMobileNumber', e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+92-XXX-XXXXXXX"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Business Fax Number *
            </label>
            <input
              type="tel"
              value={formData.businessProfile.businessFaxNumber}
              onChange={(e) => handleInputChange('businessProfile', 'businessFaxNumber', e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+92-XXX-XXXXXXX"
              required
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <div></div>
        <div className="space-x-4">
          <button
            onClick={() => saveStep(1)}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={nextStep}
            className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Next Step
          </button>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-white mb-4">Email Verification</h3>
        {emailVerified || isResubmission ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center space-x-2 text-green-400">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span className="text-lg font-medium">Email Verified!</span>
            </div>
            <p className="text-gray-300">
              {isResubmission 
                ? "Your email was previously verified. You can proceed to the next step."
                : "Your business email has been successfully verified."}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-gray-300 mb-6">
              We need to verify your business email address to continue with the registration process.
            </p>

            {!otpSent ? (
              <div className="text-center">
                <button
                  onClick={sendEmailOTP}
                  disabled={loading}
                  className="px-8 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Verification Code'}
                </button>
              </div>
            ) : !emailVerified ? (
              <div className="max-w-md mx-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Enter Verification Code
                  </label>
                  <input
                    type="text"
                    value={emailOTP}
                    onChange={(e) => setEmailOTP(e.target.value)}
                    className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>
                
                <button
                  onClick={verifyEmailOTP}
                  disabled={loading || emailOTP.length !== 6}
                  className="w-full px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
                
                <button
                  onClick={sendEmailOTP}
                  disabled={loading}
                  className="w-full px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
                >
                  Resend Code
                </button>
              </div>
            ) : (
              <div className="text-center text-green-400">
                <p className="text-lg mb-4">✓ Email verified successfully!</p>
                <button
                  onClick={nextStep}
                  className="px-8 py-3 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Continue to Next Step
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={prevStep}
          className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Previous Step
        </button>
        {(emailVerified || isResubmission) && (
          <button
            onClick={nextStep}
            className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Next Step
          </button>
        )}
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-6">Registration Bodies</h3>
        <p className="text-gray-300 mb-6">
          Add information about regulatory bodies your business is registered with.
        </p>
      </div>

      <div className="space-y-4">
        {formData.registrationBodies.map((body, index) => (
          <div key={body.id} className="bg-gray-800 p-4 rounded-md flex justify-between items-center">
            <div>
              <p className="text-white font-medium">{body.registrationBody}</p>
              <p className="text-gray-300 text-sm">
                {body.registrationNumber} - {new Date(body.registrationDate).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => removeItem('registrationBodies', body.id)}
              className="text-red-400 hover:text-red-300"
            >
              Remove
            </button>
          </div>
        ))}
        
        <button
          onClick={() => openModal('registrationBody')}
          className="w-full px-4 py-3 border-2 border-dashed border-gray-600 text-gray-300 rounded-md hover:border-gray-500 hover:text-white"
        >
          + Add Registration Body
        </button>
      </div>

      <div className="flex justify-between">
        <button
          onClick={prevStep}
          className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Previous Step
        </button>
        <div className="space-x-4">
          <button
            onClick={() => saveStep(3)}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={nextStep}
            className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Next Step
          </button>
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-6">Supporting Documents</h3>
        <p className="text-gray-300 mb-6">
          Upload all required supporting documents for your registration.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          { key: 'professionalTaxCert', label: 'Professional Tax Certificate' },
          { key: 'ntnDocument', label: 'NTN Document' },
          { key: 'drugSaleLicense', label: 'Drug Sale License' },
          { key: 'pecDocument', label: 'PEC Document' },
          { key: 'gstDocument', label: 'GST Document' }
        ].map(({ key, label }) => (
          <div key={key} className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              {label} {!formData.documents[key]?.isExisting && '*'}
            </label>
            
            {/* Show existing document if available */}
            {formData.documents[key]?.isExisting && (
              <div className="p-3 bg-gray-800 border border-green-600 rounded-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <span className="text-green-400 text-sm">
                      ✓ Previously uploaded: {formData.documents[key].fileName}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">Available</span>
                </div>
              </div>
            )}
            
            {/* File upload input */}
            <div>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => handleFileChange(key, e.target.files[0])}
                className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {formData.documents[key]?.isExisting && (
                <p className="text-xs text-gray-400 mt-1">
                  Upload a new file only if you want to replace the existing one
                </p>
              )}
            </div>
            
            {/* Show newly selected file */}
            {formData.documents[key] && formData.documents[key].name && !formData.documents[key].isExisting && (
              <p className="text-blue-400 text-sm">
                ✓ New file selected: {formData.documents[key].name}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-between">
        <button
          onClick={prevStep}
          className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Previous Step
        </button>
        <div className="space-x-4">
          <button
            onClick={() => saveStep(4)}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={nextStep}
            className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Next Step
          </button>
        </div>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-6">Business Addresses</h3>
        <p className="text-gray-300 mb-6">
          Add your business address information.
        </p>
      </div>

      <div className="space-y-4">
        {formData.addresses.map((address, index) => (
          <div key={address.id} className="bg-gray-800 p-4 rounded-md flex justify-between items-start">
            <div>
              <p className="text-white font-medium">{address.addressType}</p>
              <p className="text-gray-300 text-sm">
                {address.addressLine1}, {address.city}, {address.country}
              </p>
            </div>
            <button
              onClick={() => removeItem('addresses', address.id)}
              className="text-red-400 hover:text-red-300"
            >
              Remove
            </button>
          </div>
        ))}
        
        <button
          onClick={() => openModal('address')}
          className="w-full px-4 py-3 border-2 border-dashed border-gray-600 text-gray-300 rounded-md hover:border-gray-500 hover:text-white"
        >
          + Add Business Address
        </button>
      </div>

      <div className="flex justify-between">
        <button
          onClick={prevStep}
          className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Previous Step
        </button>
        <div className="space-x-4">
          <button
            onClick={() => saveStep(5)}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={nextStep}
            className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Next Step
          </button>
        </div>
      </div>
    </div>
  );

  const renderStep6 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-6">Past Experience Record</h3>
        <p className="text-gray-300 mb-6">
          Add your past work experience, upload proof images, and provide client references.
        </p>
      </div>

      {/* Past Work Experience */}
      <div>
        <h4 className="text-lg font-medium text-white mb-4">Past Work Experience</h4>
        <div className="space-y-4">
          {formData.pastExperience.map((experience, index) => (
            <div key={experience.id} className="bg-gray-800 p-4 rounded-md flex justify-between items-start">
              <div>
                <p className="text-white font-medium">{experience.projectTitle}</p>
                <p className="text-gray-300 text-sm">
                  Client: {experience.clientName} | Duration: {experience.duration}
                </p>
                <p className="text-gray-300 text-sm">
                  Value: {experience.projectValue} | Type: {experience.workType}
                </p>
              </div>
              <button
                onClick={() => removeItem('pastExperience', experience.id)}
                className="text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            </div>
          ))}
          
          <button
            onClick={() => openModal('pastExperience')}
            className="w-full px-4 py-3 border-2 border-dashed border-gray-600 text-gray-300 rounded-md hover:border-gray-500 hover:text-white"
          >
            + Add Past Experience
          </button>
        </div>
      </div>

      {/* Work Proof Images */}
      <div>
        <h4 className="text-lg font-medium text-white mb-4">Work Proof Images</h4>
        <div className="space-y-4">
          {formData.workProofImages.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {formData.workProofImages.map((image, index) => (
                <div key={image.id} className="relative border border-gray-600 rounded-lg overflow-hidden">
                  <img 
                    src={image.preview} 
                    alt={`Work proof ${index + 1}`}
                    className="w-full h-32 object-cover"
                  />
                  <button
                    onClick={() => removeWorkProofImage(image.id)}
                    className="absolute top-2 right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-700"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Upload Work Proof Images
            </label>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleWorkProofImageChange(e.target.files)}
              className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Select multiple images of your past work as proof
            </p>
          </div>
        </div>
      </div>

      {/* Client References */}
      <div>
        <h4 className="text-lg font-medium text-white mb-4">Client References</h4>
        <div className="space-y-4">
          {formData.clientReferences.map((reference, index) => (
            <div key={reference.id} className="bg-gray-800 p-4 rounded-md flex justify-between items-start">
              <div>
                <p className="text-white font-medium">{reference.contactName}</p>
                <p className="text-gray-300 text-sm">
                  {reference.organization} - {reference.position}
                </p>
                <p className="text-gray-300 text-sm">
                  Contact: {reference.phone || reference.email}
                </p>
              </div>
              <button
                onClick={() => removeItem('clientReferences', reference.id)}
                className="text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            </div>
          ))}
          
          <button
            onClick={() => openModal('clientReference')}
            className="w-full px-4 py-3 border-2 border-dashed border-gray-600 text-gray-300 rounded-md hover:border-gray-500 hover:text-white"
          >
            + Add Client Reference
          </button>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={prevStep}
          className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Previous Step
        </button>
        <div className="space-x-4">
          <button
            onClick={() => saveStep(6)}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={nextStep}
            className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Next Step
          </button>
        </div>
      </div>
    </div>
  );

  const renderStep7 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-6">PPRA Registration & Final Submission</h3>
        <p className="text-gray-300 mb-6">
          Add your PPRA registration information and complete your application.
        </p>
      </div>

      <div className="space-y-4">
        {formData.ppraRegistrations.map((ppra, index) => (
          <div key={ppra.id} className="bg-gray-800 p-4 rounded-md flex justify-between items-center">
            <div>
              <p className="text-white font-medium">{ppra.ppraType}</p>
              <p className="text-gray-300 text-sm">
                {ppra.registrationNumber} - {new Date(ppra.registrationDate).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => removeItem('ppraRegistrations', ppra.id)}
              className="text-red-400 hover:text-red-300"
            >
              Remove
            </button>
          </div>
        ))}
        
        <button
          onClick={() => openModal('ppra')}
          className="w-full px-4 py-3 border-2 border-dashed border-gray-600 text-gray-300 rounded-md hover:border-gray-500 hover:text-white"
        >
          + Add PPRA Registration
        </button>
      </div>

      <div className="bg-gray-800 p-6 rounded-md">
        <div className="flex items-start space-x-3">
          <input
            type="checkbox"
            id="declaration"
            checked={declaration}
            onChange={(e) => setDeclaration(e.target.checked)}
            className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="declaration" className="text-gray-300 text-sm leading-relaxed">
            We hereby declare that all information provided in this registration is true, accurate, and complete. 
            We understand that any false or misleading information may result in the rejection of our application 
            or termination of our registration. We agree to comply with all terms and conditions set forth by 
            Rawalpindi Institute of Cardiology for supplier registration and participation in tender processes.
          </label>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={prevStep}
          className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Previous Step
        </button>
        <div className="space-x-4">
          <button
            onClick={() => saveStep(7)}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={submitApplication}
            disabled={loading || !declaration}
            className="px-8 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 font-semibold"
          >
            {loading ? 'Submitting...' : 'Save & Submit Application'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderModal = () => {
    if (!showModal) return null;

    if (modalType === 'registrationBody') {
      return (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.7)'}}>
          <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-white mb-4">Add Registration Body</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Registration Body *
                </label>
                <select
                  value={modalData.registrationBody || ''}
                  onChange={(e) => setModalData({ ...modalData, registrationBody: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  required
                >
                  <option value="">Select Registration Body</option>
                  {registrationBodies.map(body => (
                    <option key={body} value={body}>{body}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Registration Number *
                </label>
                <input
                  type="text"
                  value={modalData.registrationNumber || ''}
                  onChange={(e) => setModalData({ ...modalData, registrationNumber: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  placeholder="Enter registration number"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Registration Date *
                </label>
                <input
                  type="date"
                  value={modalData.registrationDate || ''}
                  onChange={(e) => setModalData({ ...modalData, registrationDate: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => addRegistrationBody(modalData)}
                disabled={!modalData.registrationBody || !modalData.registrationNumber || !modalData.registrationDate}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'address') {
      return (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.7)'}}>
          <div className="bg-gray-900 p-6 rounded-lg max-w-lg w-full mx-4 max-h-96 overflow-y-auto">
            <h3 className="text-xl font-semibold text-white mb-4">Add Business Address</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Address Type *
                </label>
                <select
                  value={modalData.addressType || ''}
                  onChange={(e) => setModalData({ ...modalData, addressType: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  required
                >
                  <option value="">Select Address Type</option>
                  <option value="Head Office">Head Office</option>
                  <option value="Branch Office">Branch Office</option>
                  <option value="Warehouse">Warehouse</option>
                  <option value="Factory">Factory</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Address Line 1 *
                </label>
                <input
                  type="text"
                  value={modalData.addressLine1 || ''}
                  onChange={(e) => setModalData({ ...modalData, addressLine1: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  placeholder="Street address"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Address Line 2
                </label>
                <input
                  type="text"
                  value={modalData.addressLine2 || ''}
                  onChange={(e) => setModalData({ ...modalData, addressLine2: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  placeholder="Apartment, suite, etc. (optional)"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    City *
                  </label>
                  <input
                    type="text"
                    value={modalData.city || ''}
                    onChange={(e) => setModalData({ ...modalData, city: e.target.value })}
                    className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                    placeholder="City"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    State/Province *
                  </label>
                  <input
                    type="text"
                    value={modalData.stateProvince || ''}
                    onChange={(e) => setModalData({ ...modalData, stateProvince: e.target.value })}
                    className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                    placeholder="State/Province"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Postal Code *
                  </label>
                  <input
                    type="text"
                    value={modalData.postalCode || ''}
                    onChange={(e) => setModalData({ ...modalData, postalCode: e.target.value })}
                    className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                    placeholder="Postal code"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Country *
                  </label>
                  <select
                    value={modalData.country || ''}
                    onChange={(e) => setModalData({ ...modalData, country: e.target.value })}
                    className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                    required
                  >
                    <option value="">Select Country</option>
                    {countries.map(country => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => addAddress(modalData)}
                disabled={!modalData.addressType || !modalData.addressLine1 || !modalData.city || !modalData.country}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'ppra') {
      return (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.7)'}}>
          <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-white mb-4">Add PPRA Registration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  PPRA Type
                </label>
                <select
                  value={modalData.ppraType || ''}
                  onChange={(e) => setModalData({ ...modalData, ppraType: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                >
                  <option value="">Select PPRA Type</option>
                  {ppraTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Registration Number
                </label>
                <input
                  type="text"
                  value={modalData.registrationNumber || ''}
                  onChange={(e) => setModalData({ ...modalData, registrationNumber: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  placeholder="Enter registration number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Registration Date
                </label>
                <input
                  type="date"
                  value={modalData.registrationDate || ''}
                  onChange={(e) => setModalData({ ...modalData, registrationDate: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={modalData.expiryDate || ''}
                  onChange={(e) => setModalData({ ...modalData, expiryDate: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => addPPRARegistration(modalData)}
                disabled={!modalData.ppraType || !modalData.registrationNumber || !modalData.registrationDate}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'pastExperience') {
      return (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.7)'}}>
          <div className="bg-gray-900 p-6 rounded-lg max-w-lg w-full mx-4 max-h-96 overflow-y-auto">
            <h3 className="text-xl font-semibold text-white mb-4">Add Past Experience</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Project/Work Title *
                </label>
                <input
                  type="text"
                  value={modalData.projectTitle || ''}
                  onChange={(e) => setModalData({ ...modalData, projectTitle: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  placeholder="Enter project title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Client/Organization *
                </label>
                <input
                  type="text"
                  value={modalData.clientName || ''}
                  onChange={(e) => setModalData({ ...modalData, clientName: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  placeholder="Enter client name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={modalData.startDate || ''}
                    onChange={(e) => setModalData({ ...modalData, startDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={modalData.endDate || ''}
                    onChange={(e) => setModalData({ ...modalData, endDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Project Value
                  </label>
                  <input
                    type="text"
                    value={modalData.projectValue || ''}
                    onChange={(e) => setModalData({ ...modalData, projectValue: e.target.value })}
                    className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                    placeholder="e.g., $50,000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Work Type
                  </label>
                  <select
                    value={modalData.workType || ''}
                    onChange={(e) => setModalData({ ...modalData, workType: e.target.value })}
                    className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  >
                    <option value="">Select Type</option>
                    <option value="Construction">Construction</option>
                    <option value="Supply">Supply</option>
                    <option value="Services">Services</option>
                    <option value="Consulting">Consulting</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Duration
                </label>
                <input
                  type="text"
                  value={modalData.duration || ''}
                  onChange={(e) => setModalData({ ...modalData, duration: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  placeholder="e.g., 6 months"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={modalData.description || ''}
                  onChange={(e) => setModalData({ ...modalData, description: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  rows={3}
                  placeholder="Brief description of the work"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => addPastExperience(modalData)}
                disabled={!modalData.projectTitle || !modalData.clientName || !modalData.startDate}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'clientReference') {
      return (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.7)'}}>
          <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-white mb-4">Add Client Reference</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Contact Name *
                </label>
                <input
                  type="text"
                  value={modalData.contactName || ''}
                  onChange={(e) => setModalData({ ...modalData, contactName: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  placeholder="Enter contact name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Organization *
                </label>
                <input
                  type="text"
                  value={modalData.organization || ''}
                  onChange={(e) => setModalData({ ...modalData, organization: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  placeholder="Enter organization name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Position
                </label>
                <input
                  type="text"
                  value={modalData.position || ''}
                  onChange={(e) => setModalData({ ...modalData, position: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  placeholder="Enter position/title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={modalData.phone || ''}
                  onChange={(e) => setModalData({ ...modalData, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  placeholder="+92-XXX-XXXXXXX"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={modalData.email || ''}
                  onChange={(e) => setModalData({ ...modalData, email: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  placeholder="Enter email address"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Relationship
                </label>
                <input
                  type="text"
                  value={modalData.relationship || ''}
                  onChange={(e) => setModalData({ ...modalData, relationship: e.target.value })}
                  className="w-full px-4 py-3 rounded-md bg-gray-800 text-white border border-gray-600"
                  placeholder="e.g., Project Manager, Direct Supervisor"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => addClientReference(modalData)}
                disabled={!modalData.contactName || !modalData.organization}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderResubmissionFeedback = () => {
    if (!resubmissionFeedback || !showFeedbackModal) return null;

    return (
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.8)'}}>
        <div className="bg-gray-900 border border-orange-600 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-orange-400">
                  Evaluator Feedback
                </h3>
                <p className="text-sm text-orange-300">
                  From: {resubmissionFeedback.evaluatorName}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowFeedbackModal(false)}
              className="text-gray-400 hover:text-white"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          {/* Failed Criteria */}
          <div className="space-y-4 mb-6">
            <h4 className="text-md font-medium text-white">Issues to Address:</h4>
            {/* Handle both failedCriteria and issues formats */}
            {resubmissionFeedback.failedCriteria && resubmissionFeedback.failedCriteria.length > 0 && 
              resubmissionFeedback.failedCriteria.map((criteria, index) => (
                <div key={index} className="bg-orange-900 bg-opacity-30 border border-orange-700 rounded-md p-4">
                  <div className="flex items-start space-x-3">
                    <span className="flex-shrink-0 w-2 h-2 bg-orange-400 rounded-full mt-2"></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-orange-100">{criteria.criteriaName}</p>
                      <div className="mt-2 p-3 bg-orange-800 bg-opacity-40 rounded text-sm text-orange-100">
                        <span className="font-medium">Evaluator Comment: </span>
                        {criteria.evaluatorComment}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            }
            
            {/* Handle legacy issues format */}
            {resubmissionFeedback.issues && resubmissionFeedback.issues.length > 0 && 
              resubmissionFeedback.issues.map((issue, index) => (
                <div key={index} className="bg-orange-900 bg-opacity-30 border border-orange-700 rounded-md p-4">
                  <div className="flex items-start space-x-3">
                    <span className="flex-shrink-0 w-2 h-2 bg-orange-400 rounded-full mt-2"></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-orange-100">{issue.title}</p>
                      <p className="text-xs text-orange-200 mt-1">{issue.description}</p>
                      <div className="mt-2 p-3 bg-orange-800 bg-opacity-40 rounded text-sm text-orange-100">
                        <span className="font-medium">Evaluator Comment: </span>
                        {issue.comments}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            }
            
            {/* Show message if no issues found */}
            {(!resubmissionFeedback.failedCriteria || resubmissionFeedback.failedCriteria.length === 0) && 
             (!resubmissionFeedback.issues || resubmissionFeedback.issues.length === 0) && (
              <div className="bg-orange-900 bg-opacity-30 border border-orange-700 rounded-md p-4">
                <p className="text-sm text-orange-100">No specific issues listed. Please review the overall comment below.</p>
              </div>
            )}
          </div>

          {/* Overall Comment */}
          {resubmissionFeedback.overallComment && (
            <div className="bg-orange-800 bg-opacity-30 border border-orange-600 rounded-md p-4 mb-6">
              <div className="flex items-start space-x-3">
                <svg className="flex-shrink-0 w-5 h-5 text-orange-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-1l-4 4z"></path>
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-orange-100">Additional Instructions</p>
                  <p className="text-sm text-orange-200 mt-1">{resubmissionFeedback.overallComment}</p>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-4 border-t border-orange-700">
            <div className="flex items-center justify-between">
              <p className="text-xs text-orange-300">
                Requested on: {resubmissionFeedback.requestedAt ? new Date(resubmissionFeedback.requestedAt).toLocaleDateString() : 'Date not available'}
              </p>
              <button
                onClick={() => setShowFeedbackModal(false)}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Resubmission Feedback Modal */}
      {renderResubmissionFeedback()}

      {/* Loading state while fetching existing data */}
      {!dataLoaded && (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-300">Loading your registration data...</p>
          </div>
        </div>
      )}

      {/* Main content */}
      {dataLoaded && (
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Show resubmission notice if applicable */}
          {isResubmission && (
            <div className="mb-6 p-4 bg-yellow-900 border border-yellow-600 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-400">
                    Application Resubmission Required
                  </h3>
                  <div className="mt-2 text-sm text-yellow-300">
                    <p>Your application has been reviewed and requires some updates. Your previously submitted information has been pre-filled below. Please review, make the necessary changes, and resubmit.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="mb-8">
            {/* Feedback Notification Icon */}
            {resubmissionFeedback && (
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setShowFeedbackModal(true)}
                  className="relative flex items-center space-x-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition-colors duration-200"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                  </svg>
                  <span className="text-sm font-medium">View Feedback</span>
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {(resubmissionFeedback.failedCriteria?.length || 0) + (resubmissionFeedback.issues?.length || 0)}
                  </span>
                </button>
              </div>
            )}
            
            {/* Auto-save Status Indicator */}
            {autoSaveStatus && (
              <div className="flex justify-end mb-4">
                <div className={`flex items-center space-x-2 px-3 py-1 rounded-lg text-sm ${
                  autoSaveStatus === 'saving' ? 'bg-blue-600 text-white' :
                  autoSaveStatus === 'saved' ? 'bg-green-600 text-white' :
                  autoSaveStatus === 'error' ? 'bg-red-600 text-white' : ''
                }`}>
                  {autoSaveStatus === 'saving' && (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Auto-saving...</span>
                    </>
                  )}
                  {autoSaveStatus === 'saved' && (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                      </svg>
                      <span>Auto-saved</span>
                    </>
                  )}
                  {autoSaveStatus === 'error' && (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                      </svg>
                      <span>Auto-save failed</span>
                    </>
                  )}
                </div>
              </div>
            )}
            
          <div className="flex items-center justify-between mb-4">
            {steps.map((step, index) => (
              <div key={step.number} className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium border-2 ${
                  currentStep >= step.number 
                    ? 'bg-blue-600 border-blue-600 text-white' 
                    : 'border-gray-600 text-gray-400'
                }`}>
                  {currentStep > step.number ? '✓' : step.number}
                </div>
                <div className="mt-2 text-xs text-center max-w-20">
                  <div className={`font-medium ${currentStep >= step.number ? 'text-blue-400' : 'text-gray-400'}`}>
                    {step.title}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / 7) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500 bg-opacity-20 border border-red-500 rounded-md">
            <div className="flex items-start space-x-3">
              <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <div className="text-red-300">
                {error.includes('\n') ? (
                  <div>
                    <p className="font-medium mb-2">Validation Error</p>
                    <div className="space-y-1">
                      {error.split('\n').filter(line => line.trim()).map((line, index) => (
                        <p key={index} className="text-sm">{line}</p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p>{error}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step Content */}
        <div className="bg-gray-900 rounded-lg p-8">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
          {currentStep === 5 && renderStep5()}
          {currentStep === 6 && renderStep6()}
          {currentStep === 7 && renderStep7()}
        </div>

        {/* Modal */}
        {renderModal()}
      </div>
      )}
    </div>
  );
};

export default SupplierRegistrationProcess;
