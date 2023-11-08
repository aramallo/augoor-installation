---
outline: [1,2,3]
---
# OpenShift Installation
![Components of OpenShift Installation](/OpenShift.drawio.png)
### Prerequisites

- [OpenShift Create and configure Augoor Project](#create-augoor-project)
- [Install NVIDIA GPU Operator on Openshift](#install-nvidia-gpu-operator)
- [Enable the Cluster to download required Augoor images](#enable-the-cluster-to-download-the-images)
- [Rabbit MQ Installed and configured to use TLS](#install-rabbit-mq)

### Create Augoor Project

full documentation on:
  * [Working with projects](https://docs.openshift.com/container-platform/4.12/applications/projects/working-with-projects.html).
  * [Managing security context constraints](https://docs.openshift.com/container-platform/4.12/authentication/managing-security-context-constraints.html).
  * [Using node selectors to control pod placement](https://access.redhat.com/documentation/en-us/openshift_container_platform/4.12/html/nodes/controlling-pod-placement-onto-nodes-scheduling#nodes-scheduler-node-selectors-pod_nodes-scheduler-node-selectors)

1. Create an OpenShift project for Augoor installation:
```bash
oc new-project augoor
```

2. Create custom label for non-GPU machine pool.

> **TIP**: machinesets can be listed by running `oc get machineset --namespace openshift-machine-api`

```bash
oc patch MachineSet $NON_GPU_MACHINESET --type='json' \
  -p='[{"op":"add","path":"/spec/template/spec/metadata/labels", "value":{"augoor.ai/machine-type":"cpu"}}]' \
  -n openshift-machine-api
```

3. Create custom label for GPU machine pool.

> **TIP**: machinesets can be listed by running `oc get machineset --namespace openshift-machine-api`

```bash
oc patch MachineSet $GPU_MACHINESET --type='json' \
  -p='[{"op":"add","path":"/spec/template/spec/metadata/labels", "value":{"augoor.ai/machine-type":"gpu"}}]' \
  -n openshift-machine-api
```

4. Create a new Security Context Constraint for NFS access
```bash
cat >scc-augoor.yaml <<EOF
kind: SecurityContextConstraints
apiVersion: security.openshift.io/v1
metadata:
  name: scc-augoor
allowPrivilegedContainer: false
runAsUser:
  type: RunAsAny
seLinuxContext:
  type: RunAsAny
fsGroup:
  type: RunAsAny
supplementalGroups:
  type: MustRunAs
  ranges:
  - min: 1000
    max: 2000
users:
- system:serviceaccount:augoor:default
EOF

oc create -f scc-augoor.yaml
```

5. Creating a service account to give root privileges to UI container
```bash
oc create sa augoor-ui-sa
oc adm policy add-scc-to-user anyuid -z augoor-ui-sa
oc adm policy add-scc-to-user anyuid -z augoor-ui-sa -n augoor
```

### Install NVIDIA GPU Operator

full documentation on:

  * [NVIDIA GPU Operator on OpenShift](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/openshift/contents.html)
  * [Node Feature Discovery Operator](https://docs.openshift.com/container-platform/4.12/hardware_enablement/psap-node-feature-discovery-operator.html)

#### Install the Node Feature Discovery (NFD) Operator

1. Create a namespace for the NFD Operator
```bash
cat >nfd-namespace.yaml <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: openshift-nfd
EOF

oc create -f nfd-namespace.yaml
```

2. Create the operator group
```bash
cat >nfd-operatorgroup.yaml <<EOF
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata:
  generateName: openshift-nfd-
  name: openshift-nfd
  namespace: openshift-nfd
spec:
  targetNamespaces:
  - openshift-nfd
EOF

oc create -f nfd-operatorgroup.yaml
```

3. Create the subscription
```bash
cat >nfd-sub.yaml <<EOF
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: nfd
  namespace: openshift-nfd
spec:
  channel: "stable"
  installPlanApproval: Automatic
  name: nfd
  source: redhat-operators
  sourceNamespace: openshift-marketplace
EOF

oc create -f nfd-sub.yaml
```

4. Create Node Feature Discovery instance
```bash
cat >NodeFeatureDiscovery.yaml <<EOF
apiVersion: nfd.openshift.io/v1
kind: NodeFeatureDiscovery
metadata:
  name: nfd-instance
  namespace: openshift-nfd
spec:
  operand:
    image: >-
      registry.redhat.io/openshift4/ose-node-feature-discovery@sha256:bd6a32b054118acc8fed258869e0f64ca12fbb663573f293254822e5bb2ecb82
    servicePort: 12000
  workerConfig:
    configData: |
      core:
      #  labelWhiteList:
      #  noPublish: false
        sleepInterval: 60s
      #  sources: [all]
      #  klog:
      #    addDirHeader: false
      #    alsologtostderr: false
      #    logBacktraceAt:
      #    logtostderr: true
      #    skipHeaders: false
      #    stderrthreshold: 2
      #    v: 0
      #    vmodule:
      ##   NOTE: the following options are not dynamically run-time 
      ##          configurable and require a nfd-worker restart to take effect
      ##          after being changed
      #    logDir:
      #    logFile:
      #    logFileMaxSize: 1800
      #    skipLogHeaders: false
      sources:
      #  cpu:
      #    cpuid:
      ##     NOTE: whitelist has priority over blacklist
      #      attributeBlacklist:
      #        - "BMI1"
      #        - "BMI2"
      #        - "CLMUL"
      #        - "CMOV"
      #        - "CX16"
      #        - "ERMS"
      #        - "F16C"
      #        - "HTT"
      #        - "LZCNT"
      #        - "MMX"
      #        - "MMXEXT"
      #        - "NX"
      #        - "POPCNT"
      #        - "RDRAND"
      #        - "RDSEED"
      #        - "RDTSCP"
      #        - "SGX"
      #        - "SSE"
      #        - "SSE2"
      #        - "SSE3"
      #        - "SSE4.1"
      #        - "SSE4.2"
      #        - "SSSE3"
      #      attributeWhitelist:
      #  kernel:
      #    kconfigFile: "/path/to/kconfig"
      #    configOpts:
      #      - "NO_HZ"
      #      - "X86"
      #      - "DMI"
        pci:
          deviceClassWhitelist:
            - "0200"
            - "03"
            - "12"
          deviceLabelFields:
      #      - "class"
            - "vendor"
      #      - "device"
      #      - "subsystem_vendor"
      #      - "subsystem_device"
      #  usb:
      #    deviceClassWhitelist:
      #      - "0e"
      #      - "ef"
      #      - "fe"
      #      - "ff"
      #    deviceLabelFields:
      #      - "class"
      #      - "vendor"
      #      - "device"
      #  custom:
      #    - name: "my.kernel.feature"
      #      matchOn:
      #        - loadedKMod: ["example_kmod1", "example_kmod2"]
      #    - name: "my.pci.feature"
      #      matchOn:
      #        - pciId:
      #            class: ["0200"]
      #            vendor: ["15b3"]
      #            device: ["1014", "1017"]
      #        - pciId :
      #            vendor: ["8086"]
      #            device: ["1000", "1100"]
      #    - name: "my.usb.feature"
      #      matchOn:
      #        - usbId:
      #          class: ["ff"]
      #          vendor: ["03e7"]
      #          device: ["2485"]
      #        - usbId:
      #          class: ["fe"]
      #          vendor: ["1a6e"]
      #          device: ["089a"]
      #    - name: "my.combined.feature"
      #      matchOn:
      #        - pciId:
      #            vendor: ["15b3"]
      #            device: ["1014", "1017"]
      #          loadedKMod : ["vendor_kmod1", "vendor_kmod2"]
  customConfig:
    configData: |
      #    - name: "more.kernel.features"
      #      matchOn:
      #      - loadedKMod: ["example_kmod3"]
      #    - name: "more.features.by.nodename"
      #      value: customValue
      #      matchOn:
      #      - nodename: ["special-.*-node-.*"]
EOF

oc create -f NodeFeatureDiscovery.yaml
```

#### Install the NVIDIA GPU Operator

1. Create a namespace for the NVIDIA GPU Operator
```bash
cat >nvidia-gpu-operator.yaml <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: nvidia-gpu-operator
EOF

oc create -f nvidia-gpu-operator.yaml
```

2. Create the operator group
```bash
cat >nvidia-gpu-operatorgroup.yaml <<EOF
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata:
  name: nvidia-gpu-operator-group
  namespace: nvidia-gpu-operator
spec:
 targetNamespaces:
 - nvidia-gpu-operator
EOF

oc create -f nvidia-gpu-operatorgroup.yaml
```

3. Create the subscription

> **NOTE**: `channel` and `startingCSV` must be updated in the `nvidia-gpu-sub.yaml` file before run `oc create` command

```bash
CHANNEL=`oc get packagemanifest gpu-operator-certified -n openshift-marketplace -o jsonpath='{.status.defaultChannel}'`
STARTINGCSV=`oc get packagemanifests/gpu-operator-certified -n openshift-marketplace -ojson | jq -r '.status.channels[] | select(.name == "'$CHANNEL'") | .currentCSV'`

cat >nvidia-gpu-sub.yaml <<EOF
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: gpu-operator-certified
  namespace: nvidia-gpu-operator
spec:
  channel: "$CHANNEL"
  installPlanApproval: Manual
  name: gpu-operator-certified
  source: certified-operators
  sourceNamespace: openshift-marketplace
  startingCSV: "$STARTINGCSV"
EOF

oc create -f nvidia-gpu-sub.yaml
```

4. Approve the install plan
```bash
INSTALL_PLAN=$(oc get installplan -n nvidia-gpu-operator -oname)
oc patch $INSTALL_PLAN -n nvidia-gpu-operator --type merge --patch '{"spec":{"approved":true }}'
```

5. Create the cluster policy
```bash
CHANNEL=`oc get packagemanifest gpu-operator-certified -n openshift-marketplace -o jsonpath='{.status.defaultChannel}'`
STARTINGCSV=`oc get packagemanifests/gpu-operator-certified -n openshift-marketplace -ojson | jq -r '.status.channels[] | select(.name == "'$CHANNEL'") | .currentCSV'`

oc get csv -n nvidia-gpu-operator $STARTINGCSV -ojsonpath={.metadata.annotations.alm-examples} | jq .[0] > nvidia-clusterpolicy.json
oc create -f nvidia-clusterpolicy.json
```

6. Verify the successful installation of the NVIDIA GPU Operator

> **INFO**: At this point, the GPU Operator proceeds and installs all the required components to set up the NVIDIA GPUs in the
OpenShift 4 cluster. Wait at least 10-20 minutes before digging deeper into any form of troubleshooting because this may
take a period of time to finish.
```bash
oc get pods,daemonset -n nvidia-gpu-operator
```

### Enable the Cluster to Download the images

We have 2 options configure the installation to pull the images:

- [Pull direct from Augoor Container Registry](#create-a-secret-to-authenticate-the-cluster-to-augoor-container-registry) 
- [Upload to a private repository and pull from there](#upload-images-to-your-registry) 

#### ***Create a Secret to authenticate the cluster to Augoor Container Registry*** 

1. Create the pull images secret 
```bash
oc create secret docker-registry acr-secret \
  --namespace $augoorNamespace \
  --docker-server=$acrName.azurecr.io \
  --docker-username=$servicePrincipalId \
  --docker-password=$servicePrincipalPwd
```

2. Link the secret to the service account
```bash
oc secrets link default acr-secret --for=pull
```

#### ***Upload images to your registry***
In this option you need to upload the images in your own Image Registry and will impact the parameters of the installation because the image location will need to be parametrized.

### Install Rabbit MQ

Augoor use Rabbit MQ as Bus to Communicate some components

#### ***Use Helm chart to install Rabbit MQ***

full documentation on [Rabbit MQ Site](https://www.rabbitmq.com/kubernetes/operator/install-operator.html).

1. Using Bitnami helm chart
```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
oc new-project augoor-rabbit-mq
helm install rabbitmq-cluster bitnami/rabbitmq-cluster-operator -n augoor-rabbit-mq \
  --set clusterOperator.podSecurityContext.enabled=false \
  --set clusterOperator.containerSecurityContext.enabled=false \
  --set msgTopologyOperator.podSecurityContext.enabled=false \
  --set msgTopologyOperator.containerSecurityContext.enabled=false
```

#### ***Enable SSL***

use self signed certificates to patch rabbit-mq installation to enable SSL.

To create Self Signed Certificate personalize the templates
- [cert.conf](./utils/mq-certificate/cert.conf)
- [csr.conf](./utils/mq-certificate/csr.conf)

Execute the scripts in the folder [/utils/mq-certificate](./utils/mq-certificate/) in order to :
1. Create a the certificates localy in [local folder](./local/)
1. Create a Secret in kubernetes that contain the certificates
1. Patch the Rabbit MQ operator to use SSL using the certificates

Create Config Map to mount the cacerts
1. execute script [/utils/mq-certificate-auth/create-cert-configmap.sh](./utils/mq-certificate-auth/create-cert-configmap.sh) with the name of augoor kubernetes namespace as a parameter ($augoorNamespace)
