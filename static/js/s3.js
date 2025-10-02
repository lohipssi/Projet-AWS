// Variables globales
let buckets = [];

// Charger les buckets au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    loadBuckets();
    
    // Gestionnaire pour l'upload de fichiers
    document.getElementById('uploadForm').addEventListener('submit', uploadFile);
});

// Charger les buckets S3
async function loadBuckets() {
    try {
        document.getElementById('loadingBuckets').style.display = 'block';
        document.getElementById('bucketsTable').style.display = 'none';
        document.getElementById('noBuckets').style.display = 'none';
        
        const response = await fetch('/api/s3/buckets');
        const data = await response.json();
        
        if (data.error) {
            showAlert('Erreur: ' + data.error, 'danger');
            return;
        }
        
        buckets = data.buckets;
        displayBuckets();
        updateStats();
        updateUploadBucketList();
        
    } catch (error) {
        showAlert('Erreur de connexion: ' + error.message, 'danger');
    } finally {
        document.getElementById('loadingBuckets').style.display = 'none';
    }
}

// Afficher les buckets
function displayBuckets() {
    const tbody = document.getElementById('bucketsTableBody');
    tbody.innerHTML = '';
    
    if (buckets.length === 0) {
        document.getElementById('noBuckets').style.display = 'block';
        return;
    }
    
    document.getElementById('bucketsTable').style.display = 'block';
    
    buckets.forEach(bucket => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td><strong>${bucket.name}</strong></td>
            <td>${bucket.region}</td>
            <td>${bucket.creation_date}</td>
            <td>
                <span class="badge bg-info">${bucket.object_count}</span>
                ${bucket.object_count > 0 ? `<button class="btn btn-sm btn-outline-primary ms-2" onclick="showBucketObjects('${bucket.name}')">
                    <i class="fas fa-eye"></i>
                </button>` : ''}
            </td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="deleteBucket('${bucket.name}')">
                    <i class="fas fa-trash"></i> Supprimer
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// Mettre à jour les statistiques
function updateStats() {
    const totalObjects = buckets.reduce((sum, bucket) => sum + bucket.object_count, 0);
    const regions = [...new Set(buckets.map(bucket => bucket.region))].length;
    
    document.getElementById('totalBuckets').textContent = buckets.length;
    document.getElementById('totalObjects').textContent = totalObjects;
    document.getElementById('totalRegions').textContent = regions;
}

// Mettre à jour la liste des buckets pour l'upload
function updateUploadBucketList() {
    const select = document.getElementById('uploadBucket');
    select.innerHTML = '<option value="">Sélectionner un bucket</option>';
    
    buckets.forEach(bucket => {
        const option = document.createElement('option');
        option.value = bucket.name;
        option.textContent = bucket.name;
        select.appendChild(option);
    });
}

// Créer un nouveau bucket
async function createBucket() {
    const bucketName = document.getElementById('bucketName').value;
    const region = document.getElementById('bucketRegion').value;
    
    if (!bucketName || !region) {
        showAlert('Veuillez remplir tous les champs', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/s3/bucket', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bucket_name: bucketName,
                region: region
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(result.message, 'success');
            bootstrap.Modal.getInstance(document.getElementById('createBucketModal')).hide();
            document.getElementById('createBucketForm').reset();
            loadBuckets();
        } else {
            showAlert(result.error, 'danger');
        }
        
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'danger');
    }
}

// Supprimer un bucket
async function deleteBucket(bucketName) {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le bucket "${bucketName}" et tous ses objets ?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/s3/bucket/${bucketName}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(result.message, 'success');
            loadBuckets();
        } else {
            showAlert(result.error, 'danger');
        }
        
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'danger');
    }
}

// Upload de fichier
async function uploadFile(event) {
    event.preventDefault();
    
    const formData = new FormData();
    const fileInput = document.getElementById('fileInput');
    const bucketSelect = document.getElementById('uploadBucket');
    
    if (!fileInput.files[0] || !bucketSelect.value) {
        showAlert('Veuillez sélectionner un fichier et un bucket', 'warning');
        return;
    }
    
    formData.append('file', fileInput.files[0]);
    formData.append('bucket_name', bucketSelect.value);
    
    try {
        const response = await fetch('/api/s3/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(result.message, 'success');
            document.getElementById('uploadForm').reset();
            loadBuckets();
        } else {
            showAlert(result.error, 'danger');
        }
        
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'danger');
    }
}

// Afficher les objets d'un bucket
async function showBucketObjects(bucketName) {
    const modal = new bootstrap.Modal(document.getElementById('bucketObjectsModal'));
    document.getElementById('bucketObjectsTitle').textContent = `Objets du bucket: ${bucketName}`;
    
    document.getElementById('loadingObjects').style.display = 'block';
    document.getElementById('objectsList').style.display = 'none';
    document.getElementById('noObjects').style.display = 'none';
    
    modal.show();
    
    try {
        const response = await fetch(`/api/s3/bucket/${bucketName}/objects`);
        const data = await response.json();
        
        if (data.error) {
            showAlert('Erreur: ' + data.error, 'danger');
            return;
        }
        
        const tbody = document.getElementById('objectsTableBody');
        tbody.innerHTML = '';
        
        if (data.objects.length === 0) {
            document.getElementById('noObjects').style.display = 'block';
        } else {
            document.getElementById('objectsList').style.display = 'block';
            
            data.objects.forEach(obj => {
                const row = document.createElement('tr');
                const sizeFormatted = formatFileSize(obj.size);
                
                row.innerHTML = `
                    <td>${obj.key}</td>
                    <td>${sizeFormatted}</td>
                    <td>${obj.last_modified}</td>
                    <td><span class="badge bg-secondary">${obj.storage_class}</span></td>
                `;
                
                tbody.appendChild(row);
            });
        }
        
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'danger');
    } finally {
        document.getElementById('loadingObjects').style.display = 'none';
    }
}

// Formater la taille des fichiers
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
