export default function Resource(methods) {
  const instance = Object.create(Resource.prototype)
  Object.assign(instance, methods)
  return instance
}
