## 笔记

### 嵌套结构定义字段名

>即使用 ‘.’, ‘[|]’ 作为分割符，如 ‘a.b’ 意味着 a 对象下的 b 属性；’c[0]’ 意味着 c 数组的首项

这一机制借助于 lodash 类库的 set, get 方法和内置的 flattenFields 函数实现的.

- 2019.6.24

看到实时数据的处理，`setFields(fields)`这个方法有待研究，目前是没看明白。

### import hoistStatics from 'hoist-non-react-statics'

`hoistStatics`这个函数用来把一个组件的所有非react原生静态方法考进其高阶组件里

参考：

1. https://reactjs.org/docs/higher-order-components.html#static-methods-must-be-copied-over
2. https://github.com/mridgway/hoist-non-react-statics