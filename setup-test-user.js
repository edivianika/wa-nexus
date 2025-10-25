// Script untuk setup test user ID di localStorage
// Jalankan ini di browser console untuk testing

const testUserId = '00000000-0000-0000-0000-000000000000';
localStorage.setItem('user_id', testUserId);
console.log('Test user ID set:', testUserId);

// Test API calls
async function testAPI() {
  try {
    // Test connections
    const connectionsRes = await fetch('http://localhost:3000/api/connections', {
      headers: { 'x-user-id': testUserId }
    });
    const connectionsData = await connectionsRes.json();
    console.log('Connections:', connectionsData);

    // Test segments
    const segmentsRes = await fetch('http://localhost:3000/api/drip-segments', {
      headers: { 'x-user-id': testUserId }
    });
    const segmentsData = await segmentsRes.json();
    console.log('Segments:', segmentsData);
  } catch (error) {
    console.error('API test error:', error);
  }
}

testAPI();
