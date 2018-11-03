import Vue from 'vue/dist/vue.js';
import VueCompareImage from 'vue-compare-image';
import HelloWorld from './components/HelloWorld';

Array.prototype.map.call(document.querySelectorAll('.vue'), div => {
  new Vue({
    components: {VueCompareImage, HelloWorld},
  }).$mount(div);
});
