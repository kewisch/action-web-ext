# run with:
# cd pysrc; python3 pip_resolve_test.py; cd ..

from pip_resolve import satisfies_python_requirement
from collections import namedtuple

import unittest

fake_sys = namedtuple('Sys', ['version_info'])

class TestStringMethods(unittest.TestCase):

    def test(self):
        self.assertTrue(satisfies_python_requirement('>', '2.4', sys=fake_sys((2, 5))))
        self.assertTrue(satisfies_python_requirement('==', '2.3', sys=fake_sys((2, 3))))
        self.assertTrue(satisfies_python_requirement('<=', '2.3', sys=fake_sys((2, 3))))
        self.assertFalse(satisfies_python_requirement('<', '2.3', sys=fake_sys((2, 3))))
        self.assertTrue(satisfies_python_requirement('>', '3.1', sys=fake_sys((3, 5))))
        self.assertFalse(satisfies_python_requirement('>', '3.1', sys=fake_sys((2, 8))))
        self.assertTrue(satisfies_python_requirement('==', '2.*', sys=fake_sys((2, 6))))
        self.assertTrue(satisfies_python_requirement('==', '3.*', sys=fake_sys((3, 6))))

if __name__ == '__main__':
    unittest.main()
