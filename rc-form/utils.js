import hoistStatics from 'hoist-non-react-statics';
import warning from 'warning';

function getDisplayName(WrappedComponent) {
  return WrappedComponent.displayName || WrappedComponent.name || 'WrappedComponent';
}

export function argumentContainer(Container, WrappedComponent) {
  /* eslint no-param-reassign:0 */
  Container.displayName = `Form(${getDisplayName(WrappedComponent)})`;
  Container.WrappedComponent = WrappedComponent;
  return hoistStatics(Container, WrappedComponent);
}

export function identity(obj) {
  return obj;
}

export function flattenArray(arr) {
  // 使用Array.prototype.concat.apply([], arr)
  // 能够实现展平arr中的一层嵌套数组
  return Array.prototype.concat.apply([], arr);
}

/**
 * ##关于这个函数的功能##
 * 
 * 1. treeTraverse函数的目的就是将tree变量中保存的数据处理为键值对
 * 2. 生成的简直对中，键的命名和路径有关，最终的值是Field对象
 * 3. 内部针对单个Field对象、普通对象、数组、undefined、null做了不同处理
 * 4. 对于普通对象和数组进行了迭代处理
 * 
 * ##关于这个函数的写法##
 * 
 * 1. 这个函数的函数名和参数名使用了通用的命名，而不是针对了具体的场景
 * 2. 保存值时，并没有使用return的形式，而是传入了回调函数，以前不太清楚有回调的时候该如何存值，这里是一个参考
 * 
 * @param {字符串} path 
 * @param {Field对象、普通对象、数组、undefined、null} tree 
 * @param {判断函数，返回布尔值} isLeafNode 
 * @param {字符串， 错误信息} errorMessage 
 * @param {回调函数，用来实际处理键值对} callback 
 */
export function treeTraverse(path = '', tree, isLeafNode, errorMessage, callback) {
  if (isLeafNode(path, tree)) {
    callback(path, tree);
  } else if (tree === undefined || tree === null) {
    // Do nothing
  } else if (Array.isArray(tree)) {
    tree.forEach((subTree, index) => treeTraverse(
      `${path}[${index}]`,
      subTree,
      isLeafNode,
      errorMessage,
      callback
    ));
  } else { // It's object and not a leaf node
    if (typeof tree !== 'object') {
      warning(false, errorMessage);
      return;
    }
    Object.keys(tree).forEach(subTreeKey => {
      const subTree = tree[subTreeKey];
      treeTraverse(
        `${path}${path ? '.' : ''}${subTreeKey}`,
        subTree,
        isLeafNode,
        errorMessage,
        callback
      );
    });
  }
}

export function flattenFields(maybeNestedFields, isLeafNode, errorMessage) {
  const fields = {};
  treeTraverse(undefined, maybeNestedFields, isLeafNode, errorMessage, (path, node) => {
    fields[path] = node;
  });
  return fields;
}

export function normalizeValidateRules(validate, rules, validateTrigger) {
  const validateRules = validate.map((item) => {
    const newItem = {
      // 这里的item也是rules类型的
      ...item,
      trigger: item.trigger || [],
    };
    if (typeof newItem.trigger === 'string') {
      newItem.trigger = [newItem.trigger];
    }
    return newItem;
  });
  if (rules) {
    validateRules.push({
      trigger: validateTrigger ? [].concat(validateTrigger) : [],
      rules,
    });
  }
  return validateRules;
}

export function getValidateTriggers(validateRules) {
  return validateRules
    .filter(item => !!item.rules && item.rules.length)
    .map(item => item.trigger)
    .reduce((pre, curr) => pre.concat(curr), []);
}

export function getValueFromEvent(e) {
  // To support custom element
  if (!e || !e.target) {
    return e;
  }
  const { target } = e;
  return target.type === 'checkbox' ? target.checked : target.value;
}

export function getErrorStrs(errors) {
  if (errors) {
    return errors.map((e) => {
      if (e && e.message) {
        return e.message;
      }
      return e;
    });
  }
  return errors;
}

export function getParams(ns, opt, cb) {
  let names = ns;
  let options = opt;
  let callback = cb;
  if (cb === undefined) {
    if (typeof names === 'function') {
      callback = names;
      options = {};
      names = undefined;
    } else if (Array.isArray(names)) {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      } else {
        options = options || {};
      }
    } else {
      callback = options;
      options = names || {};
      names = undefined;
    }
  }
  return {
    names,
    options,
    callback,
  };
}

export function isEmptyObject(obj) {
  return Object.keys(obj).length === 0;
}

export function hasRules(validate) {
  if (validate) {
    return validate.some((item) => {
      return item.rules && item.rules.length;
    });
  }
  return false;
}

export function startsWith(str, prefix) {
  return str.lastIndexOf(prefix, 0) === 0;
}
