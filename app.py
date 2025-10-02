from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_cors import CORS
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
import os
from datetime import datetime
import json
from werkzeug.utils import secure_filename
from config import Config

app = Flask(__name__)
app.config.from_object(Config)
CORS(app)


# Configuration AWS
try:
    session = boto3.Session(
        aws_access_key_id=app.config['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=app.config['AWS_SECRET_ACCESS_KEY'],
        region_name=app.config['AWS_DEFAULT_REGION']
    )
    ec2_client = session.client('ec2')
    s3_client = session.client('s3')
    ec2_resource = session.resource('ec2')
    print(s3_client)
except Exception as e:
    print(f"Erreur de configuration AWS blablabla: {e}")
    ec2_client = None
    s3_client = None
    ec2_resource = None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ec2')
def ec2_dashboard():
    return render_template('ec2.html')

@app.route('/s3')
def s3_dashboard():
    return render_template('s3.html')

# Routes API EC2
@app.route('/api/ec2/instances', methods=['GET'])
def list_ec2_instances():
    try:
        if not ec2_client:
            return jsonify({'error': 'Configuration AWS manquante'}), 500
            
        response = ec2_client.describe_instances()
        instances = []
        
        for reservation in response['Reservations']:
            for instance in reservation['Instances']:
                name = 'N/A'
                if 'Tags' in instance:
                    for tag in instance['Tags']:
                        if tag['Key'] == 'Name':
                            name = tag['Value']
                            break
                
                instances.append({
                    'id': instance['InstanceId'],
                    'name': name,
                    'type': instance['InstanceType'],
                    'state': instance['State']['Name'],
                    'public_ip': instance.get('PublicIpAddress', 'N/A'),
                    'private_ip': instance.get('PrivateIpAddress', 'N/A'),
                    'launch_time': instance['LaunchTime'].strftime('%Y-%m-%d %H:%M:%S') if 'LaunchTime' in instance else 'N/A',
                    'availability_zone': instance['Placement']['AvailabilityZone']
                })
        
        return jsonify({'instances': instances})
    except ClientError as e:
        return jsonify({'error': f'Erreur AWS: {e}'}), 500

@app.route('/api/ec2/launch', methods=['POST'])
def launch_ec2_instance():
    try:
        if not ec2_client:
            return jsonify({'error': 'Configuration AWS manquante'}), 500
            
        data = request.get_json()
        
        params = {
            'ImageId': data.get('ami_id', 'ami-0c02fb55956c7d316'),
            'MinCount': 1,
            'MaxCount': 1,
            'InstanceType': data.get('instance_type', 't2.micro'),
            'KeyName': data.get('key_name', ''),
            'SecurityGroupIds': data.get('security_groups', ['default']),
            'TagSpecifications': [
                {
                    'ResourceType': 'instance',
                    'Tags': [
                        {
                            'Key': 'Name',
                            'Value': data.get('name', 'AWS-Manager-Instance')
                        }
                    ]
                }
            ]
        }
        
        if not params['KeyName']:
            del params['KeyName']
        
        response = ec2_client.run_instances(**params)
        instance_id = response['Instances'][0]['InstanceId']
        
        return jsonify({
            'success': True,
            'instance_id': instance_id,
            'message': f'Instance {instance_id} lancée avec succès'
        })
        
    except ClientError as e:
        return jsonify({'error': f'Erreur AWS: {e}'}), 500

@app.route('/api/ec2/stop/<instance_id>', methods=['POST'])
def stop_ec2_instance(instance_id):
    try:
        if not ec2_client:
            return jsonify({'error': 'Configuration AWS manquante'}), 500
            
        ec2_client.stop_instances(InstanceIds=[instance_id])
        return jsonify({
            'success': True,
            'message': f'Instance {instance_id} arrêtée'
        })
    except ClientError as e:
        return jsonify({'error': f'Erreur AWS: {e}'}), 500

@app.route('/api/ec2/start/<instance_id>', methods=['POST'])
def start_ec2_instance(instance_id):
    try:
        if not ec2_client:
            return jsonify({'error': 'Configuration AWS manquante'}), 500
            
        ec2_client.start_instances(InstanceIds=[instance_id])
        return jsonify({
            'success': True,
            'message': f'Instance {instance_id} démarrée'
        })
    except ClientError as e:
        return jsonify({'error': f'Erreur AWS: {e}'}), 500

# Routes API S3
@app.route('/api/s3/buckets', methods=['GET'])
def list_s3_buckets():
    try:
        print("Hello")
        if not s3_client:
            return jsonify({'error': 'Configuration AWS manquante'}), 500
        print("Hello 2")
        response = s3_client.list_buckets()
        buckets = []

        for bucket in response['Buckets']:
            try:
                location = s3_client.get_bucket_location(Bucket=bucket['Name'])
                region = location['LocationConstraint'] or 'us-east-1'
            except:
                region = 'unknown'
            
            try:
                objects = s3_client.list_objects_v2(Bucket=bucket['Name'])
                object_count = objects.get('KeyCount', 0)
            except:
                object_count = 0
            
            buckets.append({
                'name': bucket['Name'],
                'creation_date': bucket['CreationDate'].strftime('%Y-%m-%d %H:%M:%S'),
                'region': region,
                'object_count': object_count
            })
        
        return jsonify({'buckets': buckets})
    except ClientError as e:
        return jsonify({'error': f'Erreur AWS: {e}'}), 500

@app.route('/api/s3/bucket', methods=['POST'])
def create_s3_bucket():
    try:
        if not s3_client:
            return jsonify({'error': 'Configuration AWS manquante'}), 500
            
        data = request.get_json()
        bucket_name = data.get('bucket_name')
        region = data.get('region', app.config['AWS_DEFAULT_REGION'])
        
        if not bucket_name:
            return jsonify({'error': 'Nom du bucket requis'}), 400
        
        if region == 'us-east-1':
            s3_client.create_bucket(Bucket=bucket_name)
        else:
            s3_client.create_bucket(
                Bucket=bucket_name,
                CreateBucketConfiguration={'LocationConstraint': region}
            )
        
        return jsonify({
            'success': True,
            'message': f'Bucket {bucket_name} créé avec succès'
        })
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code == 'BucketAlreadyExists':
            return jsonify({'error': 'Ce nom de bucket existe déjà'}), 400
        elif error_code == 'BucketAlreadyOwnedByYou':
            return jsonify({'error': 'Vous possédez déjà ce bucket'}), 400
        else:
            return jsonify({'error': f'Erreur AWS: {e}'}), 500

@app.route('/api/s3/bucket/<bucket_name>', methods=['DELETE'])
def delete_s3_bucket(bucket_name):
    try:
        if not s3_client:
            return jsonify({'error': 'Configuration AWS manquante'}), 500
        
        try:
            objects = s3_client.list_objects_v2(Bucket=bucket_name)
            if 'Contents' in objects:
                delete_keys = {'Objects': []}
                for obj in objects['Contents']:
                    delete_keys['Objects'].append({'Key': obj['Key']})
                s3_client.delete_objects(Bucket=bucket_name, Delete=delete_keys)
        except:
            pass
        
        s3_client.delete_bucket(Bucket=bucket_name)
        
        return jsonify({
            'success': True,
            'message': f'Bucket {bucket_name} supprimé avec succès'
        })
        
    except ClientError as e:
        return jsonify({'error': f'Erreur AWS: {e}'}), 500

@app.route('/api/s3/bucket/<bucket_name>/objects', methods=['GET'])
def list_bucket_objects(bucket_name):
    try:
        if not s3_client:
            return jsonify({'error': 'Configuration AWS manquante'}), 500
            
        response = s3_client.list_objects_v2(Bucket=bucket_name)
        objects = []
        
        if 'Contents' in response:
            for obj in response['Contents']:
                objects.append({
                    'key': obj['Key'],
                    'size': obj['Size'],
                    'last_modified': obj['LastModified'].strftime('%Y-%m-%d %H:%M:%S'),
                    'storage_class': obj.get('StorageClass', 'STANDARD')
                })
        
        return jsonify({'objects': objects})
    except ClientError as e:
        return jsonify({'error': f'Erreur AWS: {e}'}), 500

@app.route('/api/s3/upload', methods=['POST'])
def upload_file_to_s3():
    try:
        if not s3_client:
            return jsonify({'error': 'Configuration AWS manquante'}), 500
        
        if 'file' not in request.files:
            return jsonify({'error': 'Aucun fichier sélectionné'}), 400
        
        file = request.files['file']
        bucket_name = request.form.get('bucket_name')
        
        if file.filename == '' or not bucket_name:
            return jsonify({'error': 'Fichier et bucket requis'}), 400
        
        filename = secure_filename(file.filename)
        s3_client.upload_fileobj(file, bucket_name, filename)
        
        return jsonify({
            'success': True,
            'message': f'Fichier {filename} uploadé vers {bucket_name}'
        })
        
    except ClientError as e:
        return jsonify({'error': f'Erreur AWS: {e}'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5123)
