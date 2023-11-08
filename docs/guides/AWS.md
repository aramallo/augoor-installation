---
outline: [2,3]
---
# AWS Installation
This document will guide you trought all the steps required to deploy Augoor in AWS Elastic Kubernetes Service (EKS).

The resulting deployment will look like the following diagram, which shows:
* An Application Load Balancer (ALB) that exposes Augoor services
* An operational EKS cluster containing Augoor's services and an instance of RabbitMQ
* Network access configured to accept incoming traffic from the ALB
* An instance of a Network File System (NFS)
* An instance of a PostgreSQL database e.g. Amazon RDS


<br>

![Components of AWS Installation](/AWS.drawio.png)

## 1. Prepare the infrastructure

### 1.1 EKS General Node Group
A K8s node group used by most Augoor's application components.

|Type of instances | Quantity | Disk   | GPU Support |
|-------------------|----------|--------|-------------|
| t3.xlarge         | 2~3      | 120 GB | Not needed  |

### 1.2 EKS GPU Node Group (Elastic Scaling)
A K8s node group used by most Augoor's machine learning model serving components which require access to a GPU.

|Type of instances|Scale Min|Scale Max|Disk|GPU Support|
|---|---|---|---|---|
| g5.4xlarge|0| >=1| 180 GB | Needed: [Amazon EKS optimized accelerated AMI](https://docs.aws.amazon.com/eks/latest/userguide/eks-optimized-ami.html#gpu-ami)|

### 1.3 Networking
The following ports have to be open on all nodes.

|Port Number|Direction|Description|
|---|---|---|
|`all`|`incoming`| Required for internode communication within the K8s cluster|
|`5432`|`outgoing`|Required for application components to communicate with the PostgreSQL database|
|`8080`|`incoming`| HTTP port for traffic incoming from from Application Load Balancers (ALBs)|


### 1.4 Additional K8s requirements
- AutoScaling should be enabled by deploying the [Cluster Autoscaler](https://github.com/kubernetes/autoscaler/blob/master/cluster-autoscaler/cloudprovider/aws/README.md)
- Install the [EFS CSI Driver](https://github.com/kubernetes-sigs/aws-efs-csi-driver/blob/master/docs/README.md#installation) which is required for K8s to manage the lifecycle of Amazon EFS file systems.

## 2. Create the EKS Cluster

::: info AWS Documentation
For full documentation please refer to [Creating an Amazon EKS cluster](https://docs.aws.amazon.com/eks/latest/userguide/create-cluster.html)
:::

### 2.1. Create an Amazon EKS cluster IAM role

```bash
cat >eks-cluster-role-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "eks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role --role-name $EKSClusterRole --assume-role-policy-document file://"eks-cluster-role-trust-policy.json"
aws iam attach-role-policy --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy --role-name $EKSClusterRole
```

### 2.2. Create a VPC
```bash
VPC_ID=$(aws ec2 create-vpc \
  --cidr-block $vnetCIDR \
  --query Vpc.VpcId \
  --output text)
aws ec2 create-tags --resources $VPC_ID --tags $tags
```

### 2.3. Create subnets for each component

::: warning IMPORTANT
For APP Subnet at least 2 availability zones are required.
:::

The following snippet will create 4 subnets.

```bash
SNET_APP_AZ1_ID=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block $snetappAZ1CIDR \
  --availability-zone $availabilityZone1 \
  --query Subnet.SubnetId \
  --output text)
aws ec2 create-tags --resources $SNET_APP_AZ1_ID --tags $tags
SNET_APP_AZ2_ID=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block $snetappAZ2CIDR \
  --availability-zone $availabilityZone1 \
  --query Subnet.SubnetId \
  --output text)
aws ec2 create-tags --resources $SNET_APP_AZ2_ID --tags $tags
SNET_STORAGE_ID=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block $snetstorageCIDR \
  --query Subnet.SubnetId \
  --output text)
aws ec2 create-tags --resources $SNET_STORAGE_ID --tags $tags
SNET_POSTGRES_ID=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block $snetpostgresCIDR \
  --query Subnet.SubnetId \
  --output text)
aws ec2 create-tags --resources $SNET_POSTGRES_ID --tags $tags
```
 
### 2.4. Create a security group for the VPC
```bash
SG_ID=$(aws ec2 create-security-group \
  --group-name $securityGroupName \
  --description $someDescription \
  --vpc-id $VPC_ID \
  --query GroupId \
  --output text)
aws ec2 create-tags --resources $SG_ID --tags $tags
```

### 2.5. Create the EKS Cluster
```bash
ACCOUNT_ID=$(aws sts get-caller-identity \
  --query Account \
  --output text)
aws eks create-cluster \
  --region $location \
  --name $clusterName \
  --kubernetes-version 1.26 \
  --role-arn arn:aws:iam::$ACCOUNT_ID:role/$EKSClusterRole \
  --resources-vpc-config subnetIds=$SNET_APP_AZ1_ID,$SNET_APP_AZ2_ID
```

## 2. Install the AWS Load Balancer controller

::: info AWS Documentation
For full documentation please refer to [Installing the AWS Load Balancer Controller add-on](https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html).
:::

### 2.1 Create an IAM Policy
```bash
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.4.7/docs/install/iam_policy.json
aws iam create-policy \
   --policy-name AWSLoadBalancerControllerIAMPolicy \
   --policy-document file://iam_policy.json
```

### 2.2. Create an IAM role
```bash
ACCOUNT_ID=$(aws sts get-caller-identity \
  --query Account \
  --output text)
CLUSTER_OIDC=$(aws eks describe-cluster \
  --name $clusterName \
  --query "cluster.identity.oidc.issuer" \
  --output text | awk -F"https://" '{ print $2 }')
cat >load-balancer-role-trust-policy.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${CLUSTER_OIDC}"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "${CLUSTER_OIDC}:sub": "system:serviceaccount:kube-system:aws-load-balancer-controller"
                }
            }
        }
    ]
}
EOF

aws iam create-role \
  --role-name AmazonEKSLoadBalancerControllerRole \
  --assume-role-policy-document file://"load-balancer-role-trust-policy.json"
aws iam attach-role-policy \
  --policy-arn arn:aws:iam::$ACCOUNT_ID:policy/AWSLoadBalancerControllerIAMPolicy \
  --role-name AmazonEKSLoadBalancerControllerRole
```

### 2.3. Create Kubernetes service account
```bash
cat >aws-load-balancer-controller-service-account.yaml <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  labels:
    app.kubernetes.io/component: controller
    app.kubernetes.io/name: aws-load-balancer-controller
  name: aws-load-balancer-controller
  namespace: kube-system
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::${ACCOUNT_ID}:role/AmazonEKSLoadBalancerControllerRole
EOF

kubectl apply -f aws-load-balancer-controller-service-account.yaml
```

### 2.4. Install the AWS Load Balancer Controller
```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo update
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=$clusterName \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller 
```

## 3. Enable the Cluster to download the Augoor components' docker images

We have 2 options to pull the Augoor components' docker images from the Augoor Container Registry:

::: details Pull directly from Augoor Container Registry

Using this option you will need to create a Secret to authenticate your K8s cluster to Augoor Container Registry.

```bash
kubectl create secret docker-registry acr-secret \
    --namespace $augoorNamespace \
    --docker-server=$acrName.azurecr.io \
    --docker-username=$servicePrincipalId \
    --docker-password=$servicePrincipalPwd
```
:::

::: details Upload the Augoor images to your private registry
In this option you need to upload the images in your own Image Registry and will impact the parameters of the installation because the image location will need to be parametrized.
:::


## 4. Configure NFS Access

::: info AWS Documentation
For full documentation please refer to
  * [Amazon EFS CSI driver](https://docs.aws.amazon.com/eks/latest/userguide/efs-csi.html).
  * [create-mount-target](https://docs.aws.amazon.com/cli/latest/reference/efs/create-mount-target.html).
:::

1. Create an IAM policy
```bash
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-efs-csi-driver/master/docs/iam-policy-example.json
aws iam create-policy \
    --policy-name AmazonEKS_EFS_CSI_Driver_Policy \
    --policy-document file://iam-policy-example.json
```

2. Create IAM role
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
CLUSTER_OIDC=$(aws eks describe-cluster --name $clusterName --query "cluster.identity.oidc.issuer" --output text | awk -F"https://" '{ print $2 }')
cat >trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::$ACCOUNT_ID:oidc-provider/$CLUSTER_OIDC"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "$CLUSTER_OIDC:sub": "system:serviceaccount:kube-system:efs-csi-controller-sa"
        }
      }
    }
  ]
}
EOF

aws iam create-role \
  --role-name AmazonEKS_EFS_CSI_DriverRole \
  --assume-role-policy-document file://"trust-policy.json"
aws iam attach-role-policy \
  --policy-arn arn:aws:iam::$ACCOUNT_ID:policy/AmazonEKS_EFS_CSI_Driver_Policy \
  --role-name AmazonEKS_EFS_CSI_DriverRole
```

3. Create Kubernetes service account
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
cat >efs-service-account.yaml <<EOF
---
apiVersion: v1
kind: ServiceAccount
metadata:
  labels:
    app.kubernetes.io/name: aws-efs-csi-driver
  name: efs-csi-controller-sa
  namespace: kube-system
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::$ACCOUNT_ID:role/AmazonEKS_EFS_CSI_DriverRole
EOF

kubectl apply -f efs-service-account.yaml
```

4. Install the Amazon EFS driver
```bash
helm repo add aws-efs-csi-driver https://kubernetes-sigs.github.io/aws-efs-csi-driver/
helm repo update
helm upgrade -i aws-efs-csi-driver aws-efs-csi-driver/aws-efs-csi-driver \
    --namespace kube-system \
    --set controller.serviceAccount.create=false \
    --set controller.serviceAccount.name=efs-csi-controller-sa
```

5. Create an Amazon EFS file system
```bash
VPC_ID=$(aws eks describe-cluster --name $clusterName --query "cluster.resourcesVpcConfig.vpcId" --output text)
EFS_SG_ID=$(aws ec2 create-security-group --group-name $EfsSecurityGroup --description $someDescription --vpc-id $VPC_ID --output text)
aws ec2 authorize-security-group-ingress \
    --group-id $EFS_SG_ID \
    --protocol tcp \
    --port 2049 \
    --cidr $SNET_STORAGE_ID
```

6. Create an Amazon EFS file system for the EKS cluster and mount target
```bash
FILE_SYSTEM_ID=$(aws efs create-file-system --region $location --performance-mode generalPurpose --query 'FileSystemId' --output text)
aws efs create-mount-target --file-system-id $FILE_SYSTEM_ID \
   --subnet-id $SNET_STORAGE_ID \
   --security-group $EFS_SG_ID
```

7. Create Augoor Directories Schema in the NFS

> **NOTE**: Check global.volumeRootPath from README.md

```bash
mkdir -p ${global.volumeRootPath}/context/{admin,maps}
mkdir -p ${global.volumeRootPath}/{efs-spider,context-api-repositories,metadata,processed,repos,index,failed}

chown -R 1000:1000 ${global.volumeRootPath}
```

## 5. Create PostgreSQL Server

Augoor use a postgres database to store the list of projects, status, and user relations to create a database server for
it execute the following command, it creates a postgres database using AWS's [RDS](https://aws.amazon.com/rds/postgresql/) solution.

full documentation on:
  * [RDS](https://aws.amazon.com/rds/postgresql/).
  * [Creating an Amazon RDS DB instance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_CreateDBInstance.html).
  * [create-db-instance](https://docs.aws.amazon.com/cli/latest/reference/rds/create-db-instance.html).

1. Create a DB subnet group
```bash
aws rds create-db-subnet-group \
    --db-subnet-group-name $subnetDBName \
    --db-subnet-group-description $someDesription \
    --subnet-ids '["$SNET_POSTGRES_ID"]' 
```

2. Create PostgreSQL server
```bash
aws rds create-db-instance \
    --db-instance-identifier $postgresName \
    --db-instance-class db.t3.micro \
    --vpc-security-group-ids $VPC_ID \
    --db-subnet-group-name $subnetDBName \
    --engine postgres \
    --master-username $postgresAdminUser \
    --master-user-password $postgresAdminPwd \
    --allocated-storage 20
```

3. Create a DataBase and the Admin user for Flyway

> **NOTE**: Check auth.flywayUser and auth.flywayPassword from README.md

```sql
CREATE ROLE ${auth.flywayUser} WITH
  LOGIN
  CREATEROLE
  ENCRYPTED PASSWORD '${auth.flywayPassword}';

COMMENT ON ROLE ${auth.flywayUser} IS 'Flyway user';

CREATE DATABASE augoor
    WITH 
    OWNER = ${auth.flywayUser}
    ENCODING = 'UTF8';
```

4. Create a DataBase and its user for Augoor application

> **NOTE**: Check global.sonarPassword from README.md

```sql
CREATE ROLE sonar WITH
  LOGIN
  NOSUPERUSER
  INHERIT
  CREATEDB
  CREATEROLE
  REPLICATION
  ENCRYPTED PASSWORD '${global.sonarPassword}';

COMMENT ON ROLE sonar IS 'Sonarqube user';

CREATE DATABASE sonarqube
    WITH 
    OWNER = sonar
    ENCODING = 'UTF8';
```
