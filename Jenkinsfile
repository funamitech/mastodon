pipeline {
    agent none
    stages {
        stage('Docker') {
            agent {
                docker {
                    label 'docker-linux-x86_64-sif'
                    image 'docker:24-cli'
                    args '--privileged -v /var/run/docker.sock:/var/run/docker.sock'
                }
            }
            when {
                anyOf {
                    branch pattern: 'test-.*', comparator: "REGEXP";
                    branch 'main';
                    buildingTag();
                }
            }
            environment {
                DOCKER_REGISTRY = 'ghcr.io'
                GITHUB_ORG = 'funamitech'
                DOCKER_IMAGE = "${env.DOCKER_REGISTRY}/${env.GITHUB_ORG}/mastodon"
                GHCR_TOKEN = credentials('siliconforest-jenkins-github-pat-package-rw')
            }
            stages {
                stage('Prepare') {
                    steps {
                        script {
                            if (env.BRANCH_NAME.startsWith('test-')) {
                                env.DOCKER_TAG = 'testing'
                                env.DOCKER_LATEST = 'false'
                            } else if (env.BRANCH_NAME == 'main') {
                                env.DOCKER_TAG = 'main'
                                env.DOCKER_LATEST = 'true'
                            } else {
                                env.DOCKER_TAG = env.TAG_NAME.replaceAll('\\+', '-')
                                env.DOCKER_LATEST = 'true'
                            }
                            env.GITHUB_REPOSITORY = "${params.URL}"
                            env.SOURCE_BASE_URL = "https://github.com/funamitech/mastodon" // I'm lazy. Will fix it later
                            env.SOURCE_TAG = "${env.BRANCH_NAME}"
                        }
                    }
                }
                stage('Docker login') {
                    steps {
                        sh 'echo $GHCR_TOKEN_PSW | docker login ghcr.io -u $GHCR_TOKEN_USR --password-stdin'
                    }
                }
                stage('Build') {
                    matrix {
                        axes {
                            axis {
                                name 'TARGET'
                                values 'amd64'
                            }
                        }
                        stages {
                            stage('Build platform specific image') {
                                steps {
                                    sh "docker build -t $DOCKER_IMAGE:$DOCKER_TAG-${TARGET} --platform linux/${TARGET} --build-arg \"GITHUB_REPOSITORY=${GITHUB_REPOSITORY}\" --build-arg \"SOURCE_BASE_URL=${SOURCE_BASE_URL}\" --build-arg \"SOURCE_TAG=${SOURCE_TAG}\" ."
                                    sh "docker build --no-cache -t $DOCKER_IMAGE:$DOCKER_TAG-streaming-${TARGET} --platform linux/${TARGET} --build-arg \"GITHUB_REPOSITORY=${GITHUB_REPOSITORY}\" --build-arg \"SOURCE_BASE_URL=${SOURCE_BASE_URL}\" --build-arg \"SOURCE_TAG=${SOURCE_TAG}\" -f ./streaming/Dockerfile ."
                                    script {
                                        if (env.DOCKER_LATEST == 'true') {
                                            sh "docker tag $DOCKER_IMAGE:$DOCKER_TAG-${TARGET} $DOCKER_IMAGE:latest-${TARGET}"
                                            sh "docker tag $DOCKER_IMAGE:$DOCKER_TAG-streaming-${TARGET} $DOCKER_IMAGE:latest-streaming-${TARGET}"
                                        }
                                    }
                                }
                            }
                            stage('Push platform specific image') {
                                steps {
                                    sh "docker push $DOCKER_IMAGE:$DOCKER_TAG-${TARGET}"
                                    sh "docker push $DOCKER_IMAGE:$DOCKER_TAG-streaming-${TARGET}"
                                    script {
                                        if (env.DOCKER_LATEST == 'true') {
                                            sh "docker push $DOCKER_IMAGE:latest-${TARGET}"
                                            sh "docker push $DOCKER_IMAGE:latest-streaming-${TARGET}"

                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                stage('Docker manifest') {
                    steps {
                        sh "docker manifest create $DOCKER_IMAGE:$DOCKER_TAG --amend $DOCKER_IMAGE:$DOCKER_TAG-amd64"
                        sh "docker manifest create $DOCKER_IMAGE:$DOCKER_TAG-streaming --amend $DOCKER_IMAGE:$DOCKER_TAG-streaming-amd64"
                        script {
                            if (env.DOCKER_LATEST == 'true') {
                                sh "docker manifest create $DOCKER_IMAGE:latest --amend $DOCKER_IMAGE:latest-amd64"
                                sh "docker manifest create $DOCKER_IMAGE:latest-streaming --amend $DOCKER_IMAGE:latest-streaming-amd64"

                            }
                        }
                    }
                }
                stage('Docker push') {
                    steps {
                        sh "docker manifest push $DOCKER_IMAGE:$DOCKER_TAG"
                        sh "docker manifest push $DOCKER_IMAGE:$DOCKER_TAG-streaming"
                        script {
                            if (env.DOCKER_LATEST == 'true') {
                                sh "docker manifest push $DOCKER_IMAGE:latest"
                                sh "docker manifest push $DOCKER_IMAGE:latest-streaming"

                            }
                        }
                    }
                }
            }
            post {
                always {
                    sh 'docker logout "$DOCKER_REGISTRY"'
                }
            }
        }
    }
}
