// Test script to verify the API response format
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const testSupplierData = async () => {
    try {
        console.log('Testing supplier data API...');
        
        // Test the comprehensive supplier data endpoint
        const response = await fetch('http://localhost:5000/api/suppliers/test-comprehensive/1');
        
        if (!response.ok) {
            console.error('API request failed:', response.status, response.statusText);
            return;
        }
        
        const data = await response.json();
        
        console.log('\n=== Testing Registration Bodies ===');
        console.log('Registration Bodies:', data.registrationBodies);
        
        if (data.registrationBodies && data.registrationBodies.length > 0) {
            const firstBody = data.registrationBodies[0];
            console.log('First Registration Body Fields:');
            console.log('- registrationBody:', firstBody.registrationBody);
            console.log('- registrationNumber:', firstBody.registrationNumber);
            console.log('- registrationDate:', firstBody.registrationDate);
        }
        
        console.log('\n=== Testing PPRA Registrations ===');
        console.log('PPRA Registrations:', data.ppraRegistrations);
        
        if (data.ppraRegistrations && data.ppraRegistrations.length > 0) {
            const firstPpra = data.ppraRegistrations[0];
            console.log('First PPRA Registration Fields:');
            console.log('- ppraType:', firstPpra.ppraType);
            console.log('- registrationNumber:', firstPpra.registrationNumber);
            console.log('- registrationDate:', firstPpra.registrationDate);
            console.log('- expiryDate:', firstPpra.expiryDate);
        }
        
        console.log('\n=== Test Complete ===');
        
    } catch (error) {
        console.error('Error testing API:', error);
    }
};

testSupplierData();
