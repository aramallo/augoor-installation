#### Node Group General services:
    
| Provider | Type of instances | Quantity | Disk   | GPU Support |
|----------|-------------------|----------|--------|-------------|
| AWS      | t3.xlarge         | 2~3      | 120 GB | Not needed  |
| Azure    | Standard_D3_v2    | 2~3      | 120 GB | Not needed  |
| GCP      | e2-standard-4     | 2~3      | 120 GB | Not needed  |

#### Node Group with GPU (Elastic Scaling):
           
|Provider|Type of instances|Scale Min|Scale Max|Disk|GPU Support|
|---|---|---|---|---|---|
|AWS| g5.4xlarge| 0   | >=1| 180 GB | Needed: [Amazon EKS optimized accelerated AMI](https://docs.aws.amazon.com/eks/latest/userguide/eks-optimized-ami.html#gpu-ami)|
|Azure| Standard_NC4as_T4_v|0| >=1   | 180 GB | Needed: [AKS GPU image enabled](https://learn.microsoft.com/en-us/azure/aks/gpu-cluster)|
|GCP| n1-standard-8 + 1 GPU NVIDIA V100  | 0   | >=1   | 180 GB | Needed: [Install NVIDIA GPU drivers automatically or manually](https://cloud.google.com/kubernetes-engine/docs/how-to/gpus#create-gpu-pool-auto-drivers) |


#### Additional requirements
- The nodes need support for GPU, Azure, and GCP are included by default AWS requires GPU Optimized AMI.
- The nodes need open communication in port `8080` from ALBs.
- The nodes need open TCP communication between nodes.
- The nodes need open TCP port `5432` communication with the postgres DB
- AutoScaling enabled in the cluster.
- for AWS [Cluster Autoscaler] (https://github.com/kubernetes/autoscaler/blob/master/cluster-autoscaler/cloudprovider/aws/README.md) Installed
- for Azure [Enable Autoscaler] (https://learn.microsoft.com/en-us/azure/aks/cluster-autoscaler) in the cluster
- NFS
- In the case of AWS [EFS CSI Driver](https://github.com/kubernetes-sigs/aws-efs-csi-driver/blob/master/docs/README.md#installation) Installed
- In the case of GCP [Filestore CSI Driver](https://cloud.google.com/kubernetes-engine/docs/how-to/persistent-volumes/filestore-csi-driver) Installed
