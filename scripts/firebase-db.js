// Aqua Cargo - Firebase Integration

const firebaseConfig = {
    apiKey: "AIzaSyByElWzz0pAO7fupmBJOb87yLDiQ00mquw",
    authDomain: "aquacargo-bf04a.firebaseapp.com",
    projectId: "aquacargo-bf04a",
    storageBucket: "aquacargo-bf04a.firebasestorage.app",
    messagingSenderId: "508443071219",
    appId: "1:508443071219:web:8f1c903dc31be214ae5d86"
};

// Initialize Firebase if not already initialized
if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
} else {
    console.error("Firebase SDK not loaded. Please ensure Firebase CDNs are included in the HTML.");
}

const firestoreDb = typeof firebase !== 'undefined' ? firebase.firestore() : null;

// ----------------------
// Local Storage Fallback
// ----------------------
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getLocalShipments() {
    try {
        const s = localStorage.getItem('aqua_shipments');
        const parsed = s ? JSON.parse(s) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function setLocalShipments(data) {
    localStorage.setItem('aqua_shipments', JSON.stringify(data));
}

function getLocalHistory() {
    try {
        const h = localStorage.getItem('aqua_history');
        const parsed = h ? JSON.parse(h) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function setLocalHistory(data) {
    localStorage.setItem('aqua_history', JSON.stringify(data));
}

// ----------------------
// Tracker API Methods (Firestore)
// ----------------------

async function getShipment(trackingNumber) {
    const localFallback = () => {
        const s = getLocalShipments().find(x => x.tracking_number === trackingNumber);
        if (s) {
            s.shipment_history = getLocalHistory().filter(h => h.shipment_id === s.id);
        }
        return s || null;
    };

    if (!firestoreDb) return localFallback();

    try {
        const shipmentsRef = firestoreDb.collection('shipments');
        const querySnapshot = await shipmentsRef.where('tracking_number', '==', trackingNumber).get();
        
        if (querySnapshot.empty) {
            return null; // Not found
        }
        
        // Assuming tracking number is unique, take the first one
        const doc = querySnapshot.docs[0];
        const shipmentData = { id: doc.id, ...doc.data() };
        
        // Fetch history
        const historyRef = firestoreDb.collection('shipment_history');
        const historySnapshot = await historyRef.where('shipment_id', '==', shipmentData.id).get();
        
        shipmentData.shipment_history = historySnapshot.docs.map(hDoc => ({ id: hDoc.id, ...hDoc.data() }));
        
        return shipmentData;
    } catch (err) {
        console.error("Error fetching shipment from Firebase, using local fallback", err);
        return localFallback();
    }
}

async function getAllShipments() {
    const localFallback = () => {
        return getLocalShipments().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    };

    if (!firestoreDb) return localFallback();
    
    try {
        const shipmentsRef = firestoreDb.collection('shipments');
        const querySnapshot = await shipmentsRef.orderBy('created_at', 'desc').get();
        
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
        console.error("Error fetching all shipments from Firebase, using local fallback", err);
        return localFallback();
    }
}

async function createShipment(shipmentData) {
    const fallbackId = uuidv4();
    shipmentData.created_at = shipmentData.created_at || new Date().toISOString();

    const localFallback = () => {
        shipmentData.id = fallbackId;
        const shipments = getLocalShipments();
        shipments.push(shipmentData);
        setLocalShipments(shipments);
        return shipmentData;
    };

    if (!firestoreDb) return localFallback();
    
    try {
        const shipmentsRef = firestoreDb.collection('shipments');
        const docRef = await shipmentsRef.add(shipmentData);
        return { id: docRef.id, ...shipmentData };
    } catch (err) {
        console.error("Error creating shipment in Firebase, using local fallback", err);
        return localFallback();
    }
}

async function updateShipment(shipmentId, updateData) {
    const localFallback = () => {
        const shipments = getLocalShipments();
        const idx = shipments.findIndex(x => x.id === shipmentId);
        if (idx !== -1) {
            shipments[idx] = { ...shipments[idx], ...updateData };
            setLocalShipments(shipments);
            return shipments[idx];
        }
        return null;
    };

    if (!firestoreDb) return localFallback();
    
    try {
        const docRef = firestoreDb.collection('shipments').doc(shipmentId);
        await docRef.update(updateData);
        
        // Fetch the updated document to return it
        const docSnap = await docRef.get();
        return { id: docSnap.id, ...docSnap.data() };
    } catch (err) {
        console.error("Error updating shipment in Firebase, using local fallback", err);
        return localFallback();
    }
}

async function deleteShipment(shipmentId) {
    const localFallback = () => {
        let shipments = getLocalShipments();
        shipments = shipments.filter(x => x.id !== shipmentId);
        setLocalShipments(shipments);
        return true;
    };

    if (!firestoreDb) return localFallback();
    
    try {
        await firestoreDb.collection('shipments').doc(shipmentId).delete();
        
        // Also delete associated history
        const historyRef = firestoreDb.collection('shipment_history');
        const historySnapshot = await historyRef.where('shipment_id', '==', shipmentId).get();
        
        const batch = firestoreDb.batch();
        historySnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        
        return true;
    } catch (err) {
        console.error("Error deleting shipment in Firebase, using local fallback", err);
        return localFallback();
    }
}

async function addShipmentHistory(historyData) {
    historyData.update_date = historyData.update_date || new Date().toISOString();

    const localFallback = () => {
        historyData.id = uuidv4();
        const history = getLocalHistory();
        history.push(historyData);
        setLocalHistory(history);
        return historyData;
    };

    if (!firestoreDb) return localFallback();
    
    try {
        const historyRef = firestoreDb.collection('shipment_history');
        const docRef = await historyRef.add(historyData);
        return { id: docRef.id, ...historyData };
    } catch (err) {
        console.error("Error adding history in Firebase, using local fallback", err);
        return localFallback();
    }
}

// Export for module usage (if enabled), otherwise accessible in window
window.db = window.db || {
    getShipment,
    getAllShipments,
    createShipment,
    updateShipment,
    deleteShipment,
    addShipmentHistory
};
